import {requireDeletionPassword} from './deletionAuthorization';
import {writeAudit} from './adminHistory';
import {workspaceError,UUID_PATTERN} from './classWorkspace.mjs';
const DAY=86400000;
// Archive-only erasure. Definitions remain as FK tombstones. Never delete live
// learners, assessment sessions, class assignments or reusable sections here.
export async function purgeSchoolArchive(db,body,admin,now=new Date()){
 if(admin?.role!=='admin'||!admin.schoolId)throw workspaceError('School administrator access required.',403);
 const kind=body.kind,startYear=Number(body.start_year),id=String(body.section_id||'');
 if(!['school_year','section'].includes(kind)||kind==='school_year'&&(!Number.isInteger(startYear)||startYear<2000||startYear>2200)||kind==='section'&&!UUID_PATTERN.test(id))throw workspaceError('Choose a valid archived school year or section.');
 if(!Number.isFinite(Date.parse(body.expected_deleted_at)))throw workspaceError('Refresh Archive and confirm this item again.',409);
 const approval=await requireDeletionPassword(db,admin.id,body.confirmation_password);
 return db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(177631,3)::text AS locked`;
  const account=await tx.user.findFirst({where:{id:admin.id,schoolId:admin.schoolId,role:'admin',isActive:true},select:{passwordHash:true,loginLockedUntil:true}});
  if(!account||account.passwordHash!==approval.passwordHash||account.loginLockedUntil>now)throw workspaceError('Sign in and confirm your administrator password again.',403);
  let record,bundles=[],classes=[],pairs=[];
  if(kind==='school_year')record=await tx.globalSchoolYear.findFirst({where:{schoolId:admin.schoolId,startYear,deletedAt:{not:null}},select:{startYear:true,deletedAt:true,purgedAt:true}});
  else record=await tx.schoolSection.findFirst({where:{id,schoolId:admin.schoolId,deletedAt:{not:null}},select:{id:true,deletedAt:true,purgedAt:true,expiresAt:true,recoveryAssignments:true,recoveryClassId:true,recoveryArchiveId:true}});
  if(!record||+record.deletedAt!==Date.parse(body.expected_deleted_at))throw workspaceError('This archive changed or is unavailable. Refresh Archive.',409);
  if(record.purgedAt)return {status:'ok',already_deleted:true};
  if(kind==='school_year'?+record.deletedAt<=+now-30*DAY:!record.expiresAt||+record.expiresAt<=+now)throw workspaceError('This archive has expired. Refresh Archive.',410);
  if(kind==='school_year'){
   const years=await tx.schoolYear.findMany({where:{schoolId:admin.schoolId,startYear,deletedAt:{not:null}},select:{id:true}});
   classes=years.length?await tx.classSection.findMany({where:{schoolYearId:{in:years.map(row=>row.id)},deletedAt:{not:null},teacher:{schoolId:admin.schoolId}},select:{id:true,teacherId:true}}):[];
   bundles=years.length?await tx.classArchive.findMany({where:{sourceSchoolYearId:{in:years.map(row=>row.id)},teacher:{schoolId:admin.schoolId},kind:'school_year',purgedAt:null,expiresAt:{not:null}},select:{id:true,teacherId:true,memberArchiveIds:true}}):[];
   pairs=bundles.flatMap(bundle=>(bundle.memberArchiveIds||[]).map(archiveId=>({id:archiveId,teacherId:bundle.teacherId})));
  }else{
   const recovery=Array.isArray(record.recoveryAssignments)&&record.recoveryAssignments.length?record.recoveryAssignments:record.recoveryClassId?[{classSectionId:record.recoveryClassId,archiveId:record.recoveryArchiveId}]:[];
   if(recovery.some(row=>!UUID_PATTERN.test(String(row?.classSectionId||''))||row.archiveId&&!UUID_PATTERN.test(String(row.archiveId))))throw workspaceError('The retained archive references need review. No records were deleted.',409);
   classes=recovery.length?await tx.classSection.findMany({where:{id:{in:recovery.map(row=>row.classSectionId)},schoolSectionId:id,deletedAt:{not:null},teacher:{schoolId:admin.schoolId}},select:{id:true,teacherId:true}}):[];
   if(classes.length!==new Set(recovery.map(row=>row.classSectionId)).size)throw workspaceError('A retained assignment changed. No records were deleted. Refresh Archive.',409);
   pairs=recovery.filter(row=>row.archiveId).map(row=>({id:row.archiveId,teacherId:classes.find(item=>item.id===row.classSectionId).teacherId}));
  }
  const snapshots=pairs.length?await tx.classArchive.findMany({where:{OR:pairs,kind:'section',teacher:{schoolId:admin.schoolId}},select:{id:true,teacherId:true,sourceSectionId:true,purgedAt:true,expiresAt:true}}):[];
  if(new Set(pairs.map(row=>row.id)).size!==snapshots.length||snapshots.some(row=>!row.expiresAt||!classes.some(item=>item.id===row.sourceSectionId&&item.teacherId===row.teacherId)))throw workspaceError('The retained archive references changed. No records were deleted.',409);
  const archiveIds=[...new Set([...bundles,...snapshots].map(row=>row.id))];
  if(archiveIds.length){
   await tx.classArchive.updateMany({where:{id:{in:archiveIds},teacher:{schoolId:admin.schoolId}},data:{purgedAt:now,encryptedSnapshot:'',learnerName:null,sectionName:'',schoolYearLabel:'',memberArchiveIds:[]}});
   await tx.adminRecoveryItem.deleteMany({where:{id:{in:archiveIds},teacherId:{in:[...new Set([...bundles,...snapshots].map(row=>row.teacherId))]}}});
  }
  if(kind==='school_year')await tx.globalSchoolYear.update({where:{schoolId_startYear:{schoolId:admin.schoolId,startYear}},data:{purgedAt:now}});
  else await tx.schoolSection.update({where:{id},data:{purgedAt:now,recoveryAssignments:[],recoveryClassId:null,recoveryArchiveId:null}});
  await writeAudit(tx,{actorId:admin.id,event:'school.archive.permanently_deleted',count:1,detail:{kind,...(kind==='school_year'?{startYear}:{sectionId:id}),archiveCount:archiveIds.length}});
  return {status:'ok'};
 });
}
