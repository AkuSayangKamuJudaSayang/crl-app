import sharp from 'sharp';
import {jwtVerify} from 'jose';
import {prisma} from './prisma';
export {getAuthenticatedUser as photoTeacher} from './auth';
export async function normalizeProfilePhoto(file){if(!file||typeof file.arrayBuffer!=='function'||file.size>2*1024*1024||file.size<1)throw Object.assign(Error('Choose an image up to 2 MB.'),{status:400});const bytes=Buffer.from(await file.arrayBuffer()),image=sharp(bytes,{limitInputPixels:16000000,animated:false}),metadata=await image.metadata();if(!['jpeg','png','webp'].includes(metadata.format)||metadata.pages>1)throw Object.assign(Error('Choose a single JPEG, PNG or WebP image.'),{status:400});const result=await image.rotate().resize(256,256,{fit:'cover'}).jpeg({quality:80,mozjpeg:true}).toBuffer();return 'data:image/jpeg;base64,'+result.toString('base64');}
