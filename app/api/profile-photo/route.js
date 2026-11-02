import {NextResponse} from 'next/server';
import {photoTeacher,normalizeProfilePhoto} from '../../../lib/profilePhoto';
import {prisma} from '../../../lib/prisma';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const json=(body,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function POST(request){const user=await photoTeacher(request);if(!user)return json({error:'Teacher sign-in is required.'},401);if(Number(request.headers.get('content-length'))>2200000)return json({error:'Choose an image up to 2 MB.'},413);try{const form=await request.formData(),photo=form.get('remove')==='true'?null:await normalizeProfilePhoto(form.get('photo'));await prisma.user.update({where:{id:user.id},data:{profilePhoto:photo}});return json({status:'ok',profile_photo:photo});}catch(e){return json({error:e.status?e.message:'Unable to read this image. Choose a JPEG, PNG or WebP file.'},e.status||400);}}
