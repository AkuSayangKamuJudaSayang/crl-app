import crypto from 'node:crypto';
import {SignJWT,jwtVerify} from 'jose';
import {verifyTotp} from './totp';
const key=()=>new TextEncoder().encode(process.env.JWT_SECRET||process.env.AUTH_SECRET||'');
export function authenticatorSecret(){const bytes=crypto.randomBytes(20),alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits=0,value=0,result='';for(const byte of bytes){value=(value<<8)|byte;bits+=8;while(bits>=5){bits-=5;result+=alphabet[(value>>>bits)&31];}}return result;}
export async function prepareAuthenticator(user){const secret=authenticatorSecret(),token=await new SignJWT({id:user.id,role:user.role,version:user.adminSessionVersion,secret}).setProtectedHeader({alg:'HS256'}).setAudience('crl-2fa-setup').setIssuedAt().setExpirationTime('10m').sign(key());return {secret,setup_token:token,otpauth_url:`otpauth://totp/${encodeURIComponent('CRL-App:'+user.username)}?secret=${secret}&issuer=CRL-App&algorithm=SHA1&digits=6&period=30`};}
export async function confirmAuthenticator(user,token,code){try{const {payload}=await jwtVerify(String(token||''),key(),{algorithms:['HS256'],audience:'crl-2fa-setup'});if(payload.id!==user.id||payload.role!==user.role||payload.version!==user.adminSessionVersion||!verifyTotp(payload.secret,code))return null;return payload.secret;}catch{return null;}}
