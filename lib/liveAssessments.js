import {prisma} from './prisma';
import {workspaceError} from './classWorkspace.mjs';
export async function liveAssessmentIds(db=prisma){return (await db.$queryRaw`SELECT host_id FROM public.crl_live_assessment_hosts()`).map(row=>row.host_id);}
export async function liveAssessmentStatus(db=prisma){
 const ids=await liveAssessmentIds(db);
 const teachers=ids.length?await db.hostSession.findMany({where:{id:{in:ids},ended:false},select:{teacherId:true}}):[];
 return {editingLocked:ids.length>0,activeTeacherCount:new Set(teachers.map(row=>row.teacherId)).size,activeAssessmentCount:ids.length,checkedAt:new Date().toISOString()};
}
export async function readLiveAssessments(query,db=prisma){
 const selected=query.get('teacher_id');const teacherId=selected?Number(selected):null;
 if(selected&&(!Number.isSafeInteger(teacherId)||teacherId<1))throw workspaceError('Choose a valid teacher.');
 const ids=await liveAssessmentIds(db);
 const hosts=ids.length?await db.hostSession.findMany({where:{id:{in:ids},ended:false,...(teacherId?{teacherId}:{})},orderBy:[{teacherId:'asc'},{id:'asc'}],select:{id:true,teacherId:true,stage:true,currentContent:true,storyTitle:true,updatedAt:true,passageStartedAt:true,passagePausedAt:true,passagePausedSeconds:true,teacher:{select:{id:true,fullName:true,profilePhoto:true}},presence:{select:{teacherSeenAt:true,teacherStatus:true,recovering:true}},assessmentSession:{select:{assessmentPeriod:true,letterResults:{orderBy:{letterIndex:'asc'},select:{letterIndex:true,letter:true,isCorrect:true}},wordResults:{orderBy:{wordIndex:'asc'},select:{wordIndex:true,word:true,isCorrect:true}},comprehensionResults:{orderBy:{questionIndex:'asc'},select:{questionIndex:true,isCorrect:true}},passageMiscues:{select:{wordIndex:true,miscueType:true}}}}}}):[];
 const grouped=new Map();for(const host of hosts){const t=host.teacher;if(!grouped.has(t.id))grouped.set(t.id,{...t,assessments:[]});grouped.get(t.id).assessments.push({id:host.id,stage:host.stage,period:host.assessmentSession?.assessmentPeriod,currentContent:host.currentContent,storyTitle:host.storyTitle,updatedAt:host.updatedAt,presence:host.presence,passageStartedAt:host.passageStartedAt,passagePausedAt:host.passagePausedAt,passagePausedSeconds:host.passagePausedSeconds,...(teacherId?{letters:host.assessmentSession?.letterResults||[],words:host.assessmentSession?.wordResults||[],comprehension:host.assessmentSession?.comprehensionResults||[],miscues:host.assessmentSession?.passageMiscues||[]}: {})});}
 return {teachers:[...grouped.values()].sort((a,b)=>a.fullName.localeCompare(b.fullName)),checkedAt:new Date().toISOString(),refreshSeconds:3};
}
