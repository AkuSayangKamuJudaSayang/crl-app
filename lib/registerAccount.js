import {sealPrivateData} from './adminHistory';
import {registrationPolicyError,REGISTRATION_POLICY_VERSION} from './registrationPolicy.mjs';
import bcrypt from 'bcryptjs';
import {prisma} from './prisma';
import {getRegistrationName} from './registrationName.mjs';
import {getRegistrationPasswordError} from './registrationPassword.mjs';
const problem=(message,status=400)=>Object.assign(Error(message),{status});
export async function registerAccount(body,role){
 if(!['teacher','reading_coordinator','admin'].includes(role))throw problem('Choose a valid account type.');
 const agreementError=registrationPolicyError(body);if(agreementError)throw problem(agreementError);
 const name=getRegistrationName(body),username=String(body.username||'').trim().toLowerCase(),email=String(body.email||'').trim().toLowerCase(),password=String(body.password||''),code=String(body.invite_code||'').trim().toUpperCase(),schoolId=String(body.school_id||'').trim();
 if(name.error)throw problem(name.error);
 if(!name.fullName||!/^[a-z0-9_.-]{3,50}$/.test(username)||!/^\S+@\S+\.\S+$/.test(email)||email.length>254||!code)throw problem('Enter your name, a valid username and email, and an invitation code.');
 const passwordError=getRegistrationPasswordError(password,body.confirm_password);if(passwordError)throw problem(passwordError);
 if(role!=='admin'&&!/^\d{6}$/.test(schoolId))throw problem('Choose a registered school.');
 const passwordHash=await bcrypt.hash(password,12);
 return prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM public.invite_codes WHERE code=${code} FOR UPDATE`;
  const invite=await tx.inviteCode.findUnique({where:{code}}),now=new Date();
  if(!invite||invite.inviteRole!==role||invite.isUsed||invite.revokedAt||invite.expiresAt&&invite.expiresAt<=now||role!=='admin'&&invite.schoolId!==schoolId)throw problem('This invitation code is invalid for the selected school and account type.');
  await tx.$queryRaw`SELECT id FROM public.users WHERE id=${invite.generatedBy||0} FOR SHARE`;
  const issuer=await tx.user.findUnique({where:{id:invite.generatedBy||0}});
  if(!issuer?.isActive||issuer.role!==(role==='teacher'?'reading_coordinator':'admin')||role==='teacher'&&issuer.schoolId!==schoolId)throw problem('The invitation issuer is no longer available.');
  const school=role==='admin'?null:await tx.school.findFirst({where:{id:schoolId,isActive:true}});if(role!=='admin'&&!school)throw problem('This school is unavailable.');
  const user=await tx.user.create({data:{username,email,passwordHash,policyAcceptedAt:new Date(),policyVersion:REGISTRATION_POLICY_VERSION,fullName:name.fullName,...name.fields,role,schoolId:school?.id||null,schoolName:school?.name||null,coordinatorId:role==='teacher'?issuer.id:null,isActive:true,twoFactorEnabled:false}});
  const claim=await tx.inviteCode.updateMany({where:{id:invite.id,isUsed:false,revokedAt:null},data:{isUsed:true,usedById:user.id,usedByName:user.fullName,usedAt:now}});if(claim.count!==1)throw problem('This invitation has already been used.',409);
  await tx.adminAuditEvent.create({data:{actorId:user.id,teacherId:user.id,schoolId:user.schoolId,actorName:user.fullName,event:'account.registered',groupKey:`registration:${invite.id}`,occurredAt:now,encryptedDetail:sealPrivateData({inviteId:invite.id,code:invite.code,usedByName:user.fullName,role:user.role,schoolId:user.schoolId})}});
  return user;
 },{maxWait:10000,timeout:15000});
}
