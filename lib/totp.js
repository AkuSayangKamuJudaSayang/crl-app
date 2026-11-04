import crypto from 'node:crypto';
export function verifyTotp(secret,code,now=Date.now()){
 const value=String(code||'');if(!secret||!/^\d{6}$/.test(value))return false;
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits=0,buffer=0;const bytes=[];
 for(const letter of secret.toUpperCase().replace(/=+$/,'')){const index=alphabet.indexOf(letter);if(index<0)return false;buffer=(buffer<<5)|index;bits+=5;if(bits>=8){bytes.push((buffer>>>(bits-8))&255);bits-=8;}}
 return [-1,0,1].some(delta=>{const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(now/30000)+delta));const digest=crypto.createHmac('sha1',Buffer.from(bytes)).update(counter).digest(),offset=digest[19]&15;const expected=String((digest.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0');return crypto.timingSafeEqual(Buffer.from(value),Buffer.from(expected));});
}
