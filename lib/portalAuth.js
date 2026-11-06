import {cookies} from 'next/headers';
import {jwtVerify,SignJWT} from 'jose';
import {prisma} from './prisma';
export const portalCookie=role=>role==='admin'?'crla_admin_token':'crl_coordinator_token';
const secret=()=>new TextEncoder().encode(process.env.JWT_SECRET||process.env.AUTH_SECRET||'');
export async function getPortalUser(request,role='reading_coordinator'){
 if(!['admin','reading_coordinator'].includes(role)||!(process.env.JWT_SECRET||process.env.AUTH_SECRET))return null;
 try{
  const token=request?request.cookies?.get(portalCookie(role))?.value||request.headers.get('authorization')?.replace(/^Bearer\s+/i,''):(await cookies()).get(portalCookie(role))?.value;
  if(!token||token.length>8192)return null;
  const {payload}=await jwtVerify(token,secret(),{algorithms:['HS256'],audience:'crl-portal'});
  if(payload.scope!==role||payload.role!==role||!Number.isSafeInteger(Number(payload.id)))return null;
  const user=await prisma.user.findUnique({where:{id:Number(payload.id)}});
  if(!user||!user.isActive||user.role!==role||payload.session_version!==user.adminSessionVersion)return null;
  if(!(await prisma.school.findFirst({where:{id:user.schoolId||'',isActive:true}})))return null;
  return user;
 }catch{return null;}
}
export const getCoordinatorUser=request=>getPortalUser(request,'reading_coordinator');
export async function signPortalToken(user){
 if(!(process.env.JWT_SECRET||process.env.AUTH_SECRET))throw Error('Authentication is not configured.');
 return new SignJWT({id:user.id,role:user.role,scope:user.role,session_version:user.adminSessionVersion}).setProtectedHeader({alg:'HS256'}).setAudience('crl-portal').setIssuedAt().setExpirationTime('8h').sign(secret());
}
export async function setPortalSession(response,user){response.cookies.set(portalCookie(user.role),await signPortalToken(user),{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:28800});return response;}
export function clearPortalSession(response,role){response.cookies.set(portalCookie(role),'',{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:0});return response;}
export function portalUser(user){return {id:user.id,role:user.role,username:user.username,email:user.email||'',full_name:user.fullName,first_name:user.firstName||'',last_name:user.lastName||'',middle_name:user.middleName||'',suffix:user.nameSuffix||'',school_id:user.schoolId||'',school_name:user.schoolName||'',profile_photo:user.profilePhoto||null,two_factor_enabled:user.twoFactorEnabled};}
