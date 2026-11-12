import {withSchoolScope} from '../../../lib/prisma';
import {schoolSetup,manageSchoolSection,viewSchoolSection,deletedSchoolSections,createSchoolYear,assignSchoolSection,insertSchoolSections,removeSchoolSectionFromYear} from '../../../lib/schoolAssignments';
import {deleteSharedSchoolYear} from '../../../lib/classWorkspaces';
import {readPlatformLogs} from '../../../lib/platformLogs';
import {writeAudit} from '../../../lib/adminHistory';
import {trustedPortalDevice,beginPortalChallenge,finishPortalChallenge,rememberPortalDevice} from '../../../lib/portalLogin';
import {prepareAuthenticator,confirmAuthenticator} from '../../../lib/portalSecurity';
import {NextResponse} from 'next/server';
import crypto from 'node:crypto';
import {enforceSensitiveRate} from '../../../lib/security';
import {prisma} from '../../../lib/prisma';
import {getPortalUser,setPortalSession,clearPortalSession,portalUser} from '../../../lib/portalAuth';
import {registerAccount} from '../../../lib/registerAccount';
import {listStaffSignupRequests,reviewStaffSignup} from '../../../lib/staffSignupApproval';
import {checkAccountPassword} from '../../../lib/loginSecurity';
import {getRegistrationName} from '../../../lib/registrationName.mjs';
import {getRegistrationPasswordError} from '../../../lib/registrationPassword.mjs';
import bcrypt from 'bcryptjs';
import {verifyTotp} from '../../../lib/totp';
export const runtime='nodejs';export const dynamic='force-dynamic';
const json=(body,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const roleOf=request=>(new URL(request.url).searchParams.get('role')==='admin'||new URL(request.url).pathname==='/api/admin')?'admin':'reading_coordinator';
async function readAccess(request){try{
 const q=new URL(request.url).searchParams,action=q.get('action');
 if(action==='directory')return json({schools:await prisma.school.findMany({where:{isActive:true},select:{id:true,name:true},orderBy:{name:'asc'}})});
 if(action==='epoch')return json({epoch:(await prisma.systemState.findUnique({where:{key:'data_epoch'}}))?.value||null});
 const user=await getPortalUser(request,roleOf(request));if(!user)return json({error:'Sign in to continue.'},401);
 if(action==='profile')return json({user:portalUser(user)});
 if(user.role!=='admin')return json({error:'Administrator access required.'},403);
 if(action==='signup_requests')return json({entries:await listStaffSignupRequests(prisma,user)});
 if(action==='logs')return json(await readPlatformLogs(prisma,q,user));
 if(action==='section_setup')return json(await schoolSetup());
 if(action==='section_view')return json(await viewSchoolSection(Object.fromEntries(q),user));
 if(action==='section_deleted')return json(await deletedSchoolSections());
 const [schools,coordinators,invites,admins,teachers,signupRequests]=await Promise.all([prisma.school.findMany({orderBy:{name:'asc'}}),prisma.user.findMany({where:{role:'reading_coordinator',approvalStatus:'approved'},select:{id:true,username:true,email:true,fullName:true,schoolId:true,schoolName:true,profilePhoto:true,isActive:true,createdAt:true}}),prisma.inviteCode.findMany({where:{inviteRole:'reading_coordinator',isUsed:false,OR:[{revokedAt:{not:null}},{expiresAt:{gt:new Date()}}]},select:{id:true,code:true,schoolId:true,inviteRole:true,expiresAt:true,revokedAt:true},orderBy:{id:'desc'},take:100}),prisma.user.findMany({where:{role:'admin'},select:{id:true,username:true,email:true,fullName:true,isActive:true}}),prisma.user.findMany({where:{role:'teacher',approvalStatus:'approved'},select:{id:true,username:true,fullName:true,schoolId:true,profilePhoto:true,isActive:true,_count:{select:{learners:true,classSections:{where:{deletedAt:null,unassignedAt:null,schoolYear:{deletedAt:null}}}}}}}),listStaffSignupRequests(prisma,user)]);
 return json({user:portalUser(user),schools,coordinators,invites,admins,teachers,signupRequests});
 }catch(error){return json({error:error.status?error.message:'Unable to load account data. Please retry.'},error.status||503);}}
async function writeAccess(request){
 let action='';
 try{
 const body=await request.json(),role=roleOf(request);
 action=String(body?.action||'').slice(0,80);
 if(['login','signup','verify_login_2fa'].includes(action)){const limited=await enforceSensitiveRate(request,action==='signup'?'register':'login',body);if(limited)return limited;}
 if(action==='logout')return clearPortalSession(json({status:'ok'}),role);
 if(action==='signup'&&role==='admin')fail('Each school has one administrator. Contact your school for administrator access.',403);
 if(action==='signup'){const user=await registerAccount(body,role);return json({status:'pending_approval',message:'Registration submitted. Your school administrator must approve your account before you can sign in.'},202);}
 if(action==='login'){
  const identifier=String(body.username||'').trim().toLowerCase(),password=String(body.password||'');if(!identifier||identifier.length>254||!password||password.length>256)fail('Enter your email or username and password.');
  const user=await prisma.user.findFirst({where:{role,OR:[{username:{equals:identifier,mode:'insensitive'}},{email:{equals:identifier,mode:'insensitive'}}]}});
  if(!user||(!user.isActive&&user.approvalStatus!=='pending'))fail('Email, username or password is incorrect.',401);
  const check=await checkAccountPassword(prisma,user.id,password);if(check.locked)return json(check.locked,423);if(!check.valid)fail('Email, username or password is incorrect.',401);
  if(user.approvalStatus==='pending')fail('Your registration is awaiting approval from the school administrator.',403);
  if(!user.isActive||user.approvalStatus==='rejected')fail('This account is unavailable. Contact your school administrator.',403);
  if(user.twoFactorEnabled&&!(await trustedPortalDevice(request,user)))return beginPortalChallenge(json({requires_2fa:true}),user);
  if(!(await prisma.school.findFirst({where:{id:user.schoolId||'',isActive:true}})))fail('This school is unavailable.',403);
  await writeAudit(prisma,{actorId:user.id,event:'login',detail:{scope:role}});return setPortalSession(json({user:portalUser(user)}),user);
 }
 if(action==='verify_login_2fa'){const verified=await finishPortalChallenge(request,role,body.code);await writeAudit(prisma,{actorId:verified.id,event:'login',detail:{scope:role}});return rememberPortalDevice(await setPortalSession(json({user:portalUser(verified)}),verified),request,verified);}
 const user=await getPortalUser(request,role);if(!user)fail('Sign in to continue.',401);
 if(['setup_2fa','confirm_2fa','disable_2fa','change_password'].includes(action)){
  const limited=await enforceSensitiveRate(request,'portal_security',{username:user.username});if(limited)return limited;
  if(action==='setup_2fa'){if(user.twoFactorEnabled)fail('Two-factor authentication is already enabled.',409);return json(await prepareAuthenticator(user));}
  if(action==='confirm_2fa'){
   if(user.twoFactorEnabled)fail('Two-factor authentication is already enabled.',409);
   const secret=await confirmAuthenticator(user,body.setup_token,body.code);if(!secret)fail('Enter a valid authenticator code. Setup expires after ten minutes.');
   const updated=await prisma.user.update({where:{id:user.id,adminSessionVersion:user.adminSessionVersion,twoFactorEnabled:false},data:{twoFactorSecret:secret,twoFactorEnabled:true,adminSessionVersion:{increment:1}}});return setPortalSession(json({user:portalUser(updated)}),updated);
  }
  const check=await checkAccountPassword(prisma,user.id,String(body.current_password||''));if(check.locked)return json(check.locked,423);if(!check.valid)fail('Your current password is incorrect.',401);
  if(user.twoFactorEnabled&&!verifyTotp(user.twoFactorSecret,body.code))fail('Enter your current authenticator code.',401);
  if(action==='disable_2fa'){if(!user.twoFactorEnabled)fail('Two-factor authentication is not enabled.');const updated=await prisma.user.update({where:{id:user.id},data:{twoFactorEnabled:false,twoFactorSecret:null,adminSessionVersion:{increment:1}}});return setPortalSession(json({user:portalUser(updated)}),updated);}
  const error=getRegistrationPasswordError(body.new_password,body.confirm_password);if(error)fail(error);
  const updated=await prisma.user.update({where:{id:user.id},data:{passwordHash:await bcrypt.hash(body.new_password,12),adminSessionVersion:{increment:1}}});return setPortalSession(json({user:portalUser(updated)}),updated);
 }
 if(action==='profile'){
  const name=getRegistrationName(body);if(name.error||!name.fullName)fail(name.error||'Enter your name.');
  const data={fullName:name.fullName,...name.fields};
  if(body.new_password)fail('Use Change password in Security & Privacy.');
  if(body.username!==undefined){const username=String(body.username).trim().toLowerCase();if(!/^[a-z0-9_.-]{3,50}$/.test(username))fail('Use 3–50 letters, numbers, dots, underscores or hyphens for your username.');data.username=username;}
  const updated=await prisma.user.update({where:{id:user.id},data});return setPortalSession(json({user:portalUser(updated)}),updated);
 }
 if(role!=='admin')fail('Administrator access required.',403);
 if(action==='review_signup')return json(await reviewStaffSignup(prisma,user,body));
 if(action==='section_view')return json(await viewSchoolSection(body,user));
 if(action==='section_action')return json(await manageSchoolSection(body,user));
 if(action==='add_school_year')return json(await createSchoolYear(body,user));
 if(action==='delete_school_year')return json(await deleteSharedSchoolYear(body,user));
 if(action==='insert_sections')return json(await insertSchoolSections(body,user));
 if(action==='remove_section')return json(await removeSchoolSectionFromYear(body,user));
 if(action==='assign_section')return json(await assignSchoolSection(body,user));
 if(action==='create_sections')return json(await manageSchoolSection({...body,section_action:'add_many'},user));
 if(action==='add_school')fail('Your administrator account manages its assigned school only.',403);
 if(action==='invite'){
  fail('Registration invitations have been replaced with school account approvals.',410);
  if(body.invite_role==='admin')fail('This school already has its administrator.',403);const inviteRole='reading_coordinator',schoolId=user.schoolId;if(body.school_id&&body.school_id!==schoolId)fail('Choose your assigned school.',403);if(inviteRole!=='admin'&&!(await prisma.school.findFirst({where:{id:schoolId,isActive:true}})))fail('Choose an active registered school.');
  const invite=await prisma.$transaction(async tx=>{const saved=await tx.inviteCode.create({data:{code:crypto.randomBytes(12).toString('hex').toUpperCase(),generatedBy:user.id,schoolId,inviteRole,expiresAt:new Date(Date.now()+7*86400000)}});await tx.adminAuditEvent.create({data:{actorId:user.id,schoolId,event:inviteRole==='admin'?'admin.invite.created':'coordinator.invite.created'}});return saved;});return json({invite:{id:invite.id,code:invite.code,schoolId,inviteRole,expiresAt:invite.expiresAt}},201);
 }
 if(action==='revoke_invite'){fail('Registration codes are retired. Use Account approvals.',410);await prisma.$transaction(async tx=>{const invite=await tx.inviteCode.findFirst({where:{id:Number(body.id),inviteRole:{in:['reading_coordinator','admin']},isUsed:false,revokedAt:null}});if(!invite)fail('Invitation unavailable.',404);await tx.inviteCode.update({where:{id:invite.id},data:{revokedAt:new Date()}});await tx.adminAuditEvent.create({data:{actorId:user.id,schoolId:invite.schoolId,event:invite.inviteRole==='admin'?'admin.invite.revoked':'coordinator.invite.revoked'}});});return json({status:'ok'});}
 if(['toggle_coordinator','toggle_teacher'].includes(action)){
  const target=await prisma.user.findFirst({where:{id:Number(body.id),role:action==='toggle_teacher'?'teacher':'reading_coordinator'}});if(!target)fail('Coordinator unavailable.',404);
  if(target.approvalStatus!=='approved')fail('Pending or rejected signups must be reviewed in Account approvals.',409);
  await prisma.$transaction(async tx=>{await tx.user.update({where:{id:target.id},data:{isActive:!target.isActive,adminSessionVersion:{increment:1}}});await tx.adminAuditEvent.create({data:{actorId:user.id,teacherId:target.id,schoolId:target.schoolId,event:action==='toggle_teacher'?'teacher.access.changed':'coordinator.access.changed'}});});return json({status:'ok'});
 }
 fail('Unknown action.');
 }catch(error){
  if(!error.status||error.status>=500)console.error('[school-access-write]',{action,name:error.name||null,code:error.code||null,message:String(error.message||'').slice(0,500)});
  return json({error:error.code==='P2002'?'This username, email, or school number already exists.':error.status?error.message:'Unable to complete this request. Please retry.'},error.code==='P2002'?409:error.status||503);
 }}

async function schoolAccess(request,handler){
 const q=new URL(request.url).searchParams;
 if(request.method==='GET'&&['directory','epoch'].includes(q.get('action')))return handler(request);
 if(request.method==='POST'){const body=await (request.clone?request.clone():request).json().catch(()=>({}));if(['login','signup','logout','verify_login_2fa'].includes(body.action))return handler(request);}
 const user=await getPortalUser(request,roleOf(request));if(!user)return json({error:'Sign in to continue.'},401);
 try{return await withSchoolScope(user.schoolId,()=>handler(request));}catch(e){
  if(!e.status||e.status>=500)console.error('[school-access-transaction]',{path:new URL(request.url).pathname,name:e.name||null,code:e.code||null,message:String(e.message||'').slice(0,500)});
  return json({error:e.status?e.message:'Unable to complete this school request.'},e.status||503);
 }
}
export const GET=request=>schoolAccess(request,readAccess);
export const POST=request=>schoolAccess(request,writeAccess);
