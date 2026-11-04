import {NextResponse} from 'next/server';
import crypto from 'node:crypto';
import {enforceSensitiveRate} from '../../../lib/security';
import {prisma} from '../../../lib/prisma';
import {getPortalUser,setPortalSession,clearPortalSession,portalUser} from '../../../lib/portalAuth';
import {registerAccount} from '../../../lib/registerAccount';
import {checkAccountPassword} from '../../../lib/loginSecurity';
import {getRegistrationName} from '../../../lib/registrationName.mjs';
import {getRegistrationPasswordError} from '../../../lib/registrationPassword.mjs';
import bcrypt from 'bcryptjs';
import {verifyTotp} from '../../../lib/totp';
export const runtime='nodejs';export const dynamic='force-dynamic';
const json=(body,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const roleOf=request=>(new URL(request.url).searchParams.get('role')==='admin'||new URL(request.url).pathname==='/api/admin')?'admin':'reading_coordinator';
export async function GET(request){try{
 const q=new URL(request.url).searchParams,action=q.get('action');
 if(action==='directory')return json({schools:await prisma.school.findMany({where:{isActive:true,...(q.get('account')==='teacher'?{users:{some:{role:'reading_coordinator',isActive:true}}}:{})},select:{id:true,name:true},orderBy:{name:'asc'}})});
 if(action==='epoch')return json({epoch:(await prisma.systemState.findUnique({where:{key:'data_epoch'}}))?.value||null});
 const user=await getPortalUser(request,roleOf(request));if(!user)return json({error:'Sign in to continue.'},401);
 if(action==='profile')return json({user:portalUser(user)});
 if(user.role!=='admin')return json({error:'Administrator access required.'},403);
 const [schools,coordinators,invites,admins]=await Promise.all([prisma.school.findMany({orderBy:{name:'asc'}}),prisma.user.findMany({where:{role:'reading_coordinator'},select:{id:true,username:true,email:true,fullName:true,schoolId:true,schoolName:true,isActive:true,createdAt:true}}),prisma.inviteCode.findMany({where:{inviteRole:{in:['reading_coordinator','admin']},isUsed:false,revokedAt:null,expiresAt:{gt:new Date()}},select:{id:true,code:true,schoolId:true,inviteRole:true,expiresAt:true},orderBy:{id:'desc'},take:100}),prisma.user.findMany({where:{role:'admin'},select:{id:true,username:true,email:true,fullName:true,isActive:true}})]);
 return json({user:portalUser(user),schools,coordinators,invites,admins});
 }catch{return json({error:'Unable to load account data. Please retry.'},503);}}
export async function POST(request){try{
 const body=await request.json(),role=roleOf(request),action=body.action;
 if(['login','signup'].includes(action)){const limited=await enforceSensitiveRate(request,action==='signup'?'register':'login',body);if(limited)return limited;}
 if(action==='logout')return clearPortalSession(json({status:'ok'}),role);
 if(action==='signup'){const user=await registerAccount(body,role);return json({status:'ok',message:'Account created. You can now sign in.',user:portalUser(user)},201);}
 if(action==='login'){
  const identifier=String(body.username||'').trim().toLowerCase(),password=String(body.password||'');if(!identifier||identifier.length>254||!password||password.length>256)fail('Enter your email or username and password.');
  const user=await prisma.user.findFirst({where:{role,isActive:true,OR:[{username:{equals:identifier,mode:'insensitive'}},{email:{equals:identifier,mode:'insensitive'}}]}});
  if(!user)fail('Email, username or password is incorrect.',401);
  const check=await checkAccountPassword(prisma,user.id,password);if(check.locked)return json(check.locked,423);if(!check.valid)fail('Email, username or password is incorrect.',401);
  if(user.twoFactorEnabled&&!verifyTotp(user.twoFactorSecret,body.totp))fail('Enter a valid authenticator code.',401);
  if(role!=='admin'&&!(await prisma.school.findFirst({where:{id:user.schoolId||'',isActive:true}})))fail('This school is unavailable.',403);
  return setPortalSession(json({user:portalUser(user)}),user);
 }
 const user=await getPortalUser(request,role);if(!user)fail('Sign in to continue.',401);
 if(action==='profile'){
  const name=getRegistrationName(body);if(name.error||!name.fullName)fail(name.error||'Enter your name.');
  const data={fullName:name.fullName,...name.fields};
  if(body.new_password){const check=await checkAccountPassword(prisma,user.id,String(body.current_password||''));if(!check.valid)fail('Your current password is incorrect.',401);const error=getRegistrationPasswordError(body.new_password,body.confirm_password);if(error)fail(error);data.passwordHash=await bcrypt.hash(body.new_password,12);data.adminSessionVersion={increment:1};}
  const updated=await prisma.user.update({where:{id:user.id},data});return setPortalSession(json({user:portalUser(updated)}),updated);
 }
 if(role!=='admin')fail('Administrator access required.',403);
 if(action==='add_school'){
  const id=String(body.school_id||'').trim(),name=String(body.school_name||'').trim();if(!/^\d{6}$/.test(id)||name.length<2||name.length>150)fail('Enter a school name and its six-digit school number.');
  return json({school:await prisma.school.create({data:{id,name}})},201);
 }
 if(action==='invite'){
  const inviteRole=body.invite_role==='admin'?'admin':'reading_coordinator',schoolId=inviteRole==='admin'?null:String(body.school_id||'');if(inviteRole!=='admin'&&!(await prisma.school.findFirst({where:{id:schoolId,isActive:true}})))fail('Choose an active registered school.');
  const invite=await prisma.inviteCode.create({data:{code:crypto.randomBytes(12).toString('hex').toUpperCase(),generatedBy:user.id,schoolId,inviteRole,expiresAt:new Date(Date.now()+7*86400000)}});return json({invite:{id:invite.id,code:invite.code,schoolId,inviteRole,expiresAt:invite.expiresAt}},201);
 }
 if(action==='revoke_invite'){await prisma.inviteCode.updateMany({where:{id:Number(body.id),inviteRole:{in:['reading_coordinator','admin']},isUsed:false},data:{revokedAt:new Date()}});return json({status:'ok'});}
 if(action==='toggle_coordinator'){
  const target=await prisma.user.findFirst({where:{id:Number(body.id),role:'reading_coordinator'}});if(!target)fail('Coordinator unavailable.',404);
  await prisma.user.update({where:{id:target.id},data:{isActive:!target.isActive,adminSessionVersion:{increment:1}}});return json({status:'ok'});
 }
 fail('Unknown action.');
 }catch(error){return json({error:error.code==='P2002'?'This username, email, or school number already exists.':error.status?error.message:'Unable to complete this request. Please retry.'},error.code==='P2002'?409:error.status||503);}}
