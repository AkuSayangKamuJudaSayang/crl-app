import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '../../../../lib/auth';
import { prisma } from '../../../../lib/prisma';
import { enforceSensitiveRate, logSecureError } from '../../../../lib/security';
import { requireDeletionPassword, createDeletionCertificate } from '../../../../lib/deletionAuthorization';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const reply=(body,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(request) {
  try {
    const auth=await getAuthenticatedUser(request);
    if(!auth || !['teacher','admin'].includes(auth.role))return reply({error:'A signed-in teacher account is required.'},401);
    const body=await request.json();
    const rate=await enforceSensitiveRate(request,'deletion_confirmation',{username:auth.username});
    if(rate)return rate;
    const user=await requireDeletionPassword(prisma,Number(auth.id),body.password);
    const certificate=createDeletionCertificate(user,body.publicKey);
    const ids=Array.isArray(body.learner_ids)?[...new Set(body.learner_ids.map(Number).filter(id=>Number.isSafeInteger(id)&&id>0))].slice(0,500):[];
    const targets=ids.length?await prisma.learner.findMany({where:{teacherId:Number(user.id),id:{in:ids}},select:{id:true,lrn:true}}):[];
    return reply({certificate,userId:Number(user.id),targets});
  } catch(error) {
    if(error.status)return reply({error:error.message,...error.payload},error.status);
    logSecureError('Deletion confirmation failed',error);
    return reply({error:'Password confirmation is temporarily unavailable.'},503);
  }
}
