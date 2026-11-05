import crypto from 'node:crypto';
import {SignJWT,jwtVerify} from 'jose';
import {prisma} from './prisma';
import {verifyTotp} from './totp';
import {isLoginLocked} from './loginSecurity';
const key=()=>new TextEncoder().encode(process.env.JWT_SECRET||process.env.AUTH_SECRET||'');
const cookie=(role,kind)=>`crl_${role}_${kind}`;
const options={httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/'};
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const agent=request=>hash(request.headers?.get('user-agent')||'');
const read=(request,role,kind)=>request.cookies?.get(cookie(role,kind))?.value||'';
const fail=()=>{throw Object.assign(Error('Your verification request expired. Sign in again.'),{status:401});};
export async function trustedPortalDevice(request,user){try{const {payload}=await jwtVerify(read(request,user.role,'device'),key(),{algorithms:['HS256'],audience:'crl-portal-device'});return payload.id===user.id&&payload.role===user.role&&payload.version===user.adminSessionVersion&&payload.agent===agent(request);}catch{return false;}}
export async function beginPortalChallenge(response,user){
 const token=crypto.randomBytes(32).toString('base64url');
 await prisma.portalLoginChallenge.deleteMany({where:{OR:[{expiresAt:{lt:new Date()}},{userId:user.id}]}});
 await prisma.portalLoginChallenge.create({data:{tokenHash:hash(token),userId:user.id,sessionVersion:user.adminSessionVersion,expiresAt:new Date(Date.now()+300000)}});
 response.cookies.set(cookie(user.role,'challenge'),token,{...options,maxAge:300});return response;
}
export async function finishPortalChallenge(request,role,code){
 const token=read(request,role,'challenge');if(!/^[A-Za-z0-9_-]{43}$/.test(token))fail();
 const tokenHash=hash(token),now=new Date();
 // Reserve each attempt atomically. Five tries per password-verified challenge.
 const reserved=await prisma.portalLoginChallenge.updateMany({where:{tokenHash,expiresAt:{gt:now},attempts:{lt:5}},data:{attempts:{increment:1}}});if(reserved.count!==1)fail();
 const challenge=await prisma.portalLoginChallenge.findUnique({where:{tokenHash},include:{user:true}}),user=challenge?.user;
 if(!user||user.role!==role||!user.isActive||!user.twoFactorEnabled||isLoginLocked(user)||user.adminSessionVersion!==challenge.sessionVersion)fail();
 if(role!=='admin'&&!(await prisma.school.findFirst({where:{id:user.schoolId||'',isActive:true}})))fail();
 if(!verifyTotp(user.twoFactorSecret,code))throw Object.assign(Error('Enter a valid six-digit authenticator code.'),{status:401});
 const consumed=await prisma.portalLoginChallenge.deleteMany({where:{tokenHash,sessionVersion:user.adminSessionVersion}});if(consumed.count!==1)fail();return user;
}
export async function rememberPortalDevice(response,request,user){
 const token=await new SignJWT({id:user.id,role:user.role,version:user.adminSessionVersion,agent:agent(request)}).setProtectedHeader({alg:'HS256'}).setAudience('crl-portal-device').setIssuedAt().setExpirationTime('30d').sign(key());
 response.cookies.set(cookie(user.role,'device'),token,{...options,maxAge:2592000});response.cookies.set(cookie(user.role,'challenge'),'',{...options,maxAge:0});return response;
}
