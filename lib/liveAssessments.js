import {prisma} from './prisma';
export async function liveAssessmentIds(db=prisma){return (await db.$queryRaw`SELECT host_id FROM public.crl_live_assessment_hosts()`).map(row=>row.host_id);}
export async function liveAssessmentStatus(db=prisma){
 const ids=await liveAssessmentIds(db);
 const teachers=ids.length?await db.hostSession.findMany({where:{id:{in:ids},ended:false},select:{teacherId:true}}):[];
 return {editingLocked:ids.length>0,activeTeacherCount:new Set(teachers.map(row=>row.teacherId)).size,activeAssessmentCount:ids.length,checkedAt:new Date().toISOString()};
}
