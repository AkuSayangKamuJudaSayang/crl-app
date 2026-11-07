import {scheduleIsLive,scheduleStatus,scheduleIssue,rangesOverlap,dateOnly,manilaDay,scheduledWindowOpen,scheduleInstant,instantIssue,windowsOverlap,SINGLE_LIVE_NOTICE} from './assessmentSchedule.mjs';
import crypto from 'node:crypto';
import {requireDeletionPassword} from './deletionAuthorization';
import {prisma} from './prisma';
import {schoolScope} from './schoolContext';
import {sectionName,schoolYearLabel,workspaceError,UUID_PATTERN} from './classWorkspace.mjs';
import {handleClassAction} from './classWorkspaces';
import {writeAudit} from './adminHistory';
import {lockSharedLibrary,refreshSchoolScheduleState} from './coordinatorPolicy';
const active=async(tx,startYear)=>{const year=await tx.globalSchoolYear.findUnique({where:{startYear:Number(startYear)}});if(!year||year.deletedAt)throw workspaceError('Choose an active school year.',409);return year;};
export async function schoolSetup(){
 await refreshSchoolScheduleState(prisma);
 const [years,sections,teachers,assessments]=await Promise.all([prisma.globalSchoolYear.findMany({where:{deletedAt:null},orderBy:{startYear:'desc'}}),prisma.schoolSection.findMany({where:{deletedAt:null},orderBy:[{startYear:'desc'},{name:'asc'}],include:{classes:{where:{deletedAt:null},select:{id:true,teacherId:true,_count:{select:{learners:true}}}}}}),prisma.user.findMany({where:{role:'teacher',isActive:true},select:{id:true,fullName:true,profilePhoto:true},orderBy:{fullName:'asc'}}),prisma.schoolAssessment.findMany({orderBy:[{startYear:'desc'},{period:'asc'}]})]);const now=Date.now();return {years,sections,teachers,serverNow:new Date(now).toISOString(),assessments:assessments.map(row=>({...row,isLive:scheduleIsLive(row,now),scheduleStatus:scheduleStatus(row,now),startsOn:dateOnly(row.startsOn)||null,endsOn:dateOnly(row.endsOn)||null}))};
}
export async function deletedSchoolSections(){const now=new Date();return {sections:await prisma.schoolSection.findMany({where:{deletedAt:{not:null},expiresAt:{gt:now}},orderBy:{deletedAt:'desc'},select:{id:true,name:true,startYear:true,deletedAt:true,expiresAt:true}}),serverNow:now.toISOString()};}
export async function manageSchoolSection(body,admin){
 if(admin.role!=='admin')throw workspaceError('Only your school administrator can create, rename or delete sections.',403);
 if(body.section_action==='delete'&&body.confirmation_password)await requireDeletionPassword(prisma,admin.id,body.confirmation_password);
 return prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(177631,3)::text AS locked`;
  const year=await active(tx,body.start_year);const id=String(body.id||'');let old=null;
  if(body.section_action!=='add'){if(!UUID_PATTERN.test(id))throw workspaceError('Choose a valid section.');await tx.$queryRaw`SELECT id FROM public.school_sections WHERE id=${id}::uuid FOR UPDATE`;old=await tx.schoolSection.findFirst({where:{id,startYear:year.startYear,deletedAt:body.section_action==='restore'?{not:null}:null},include:{classes:{where:{deletedAt:null},include:{_count:{select:{learners:true}},teacher:{select:{learnerDataVersion:true}}}}}});if(!old)throw workspaceError('Section unavailable.',404);}
  if(body.section_action==='restore'){
   if(!old.expiresAt||old.expiresAt<=new Date())throw workspaceError('This section has expired.',410);
   if(await tx.schoolSection.findFirst({where:{startYear:year.startYear,nameKey:old.nameKey,deletedAt:null}}))throw workspaceError('A section with this name already exists in the school year.',409);
   const prior=old.recoveryClassId?await tx.classSection.findFirst({where:{id:old.recoveryClassId,schoolSectionId:old.id},include:{teacher:{select:{learnerDataVersion:true}},schoolYear:true}}):null;
   if(old.recoveryClassId&&(!prior||prior.schoolYear.deletedAt||prior.schoolYear.archivedAt))throw workspaceError('Restore the original school year before restoring this section.',409);
   await tx.schoolSection.update({where:{id},data:{deletedAt:null,expiresAt:null,recoveryClassId:null,recoveryArchiveId:null}});
   if(prior){
    if(await tx.classSection.findFirst({where:{teacherId:prior.teacherId,schoolYearId:prior.schoolYearId,nameKey:prior.nameKey,deletedAt:null}}))throw workspaceError('The teacher already has a section with this name.',409);
    await tx.classSection.update({where:{id:prior.id},data:{deletedAt:null,archivedAt:null}});
    if(old.recoveryArchiveId)await handleClassAction('restore_class_archive',prior.teacherId,{archive_id:old.recoveryArchiveId,class_section_id:prior.id,roster_version:prior.teacher.learnerDataVersion},null,admin);
    if(prior.archivedAt)await tx.classSection.update({where:{id:prior.id},data:{archivedAt:prior.archivedAt}});
   }
  }else if(body.section_action==='delete'){
   let recoveryArchiveId=null;
   for(const c of old.classes){if(await tx.hostSession.count({where:{teacherId:c.teacherId,learner:{classSectionId:c.id},ended:false}}))throw workspaceError('End the active assessment before deleting this section.',409);await handleClassAction('delete_class_section',c.teacherId,{id:crypto.randomUUID(),class_section_id:c.id,roster_version:c.teacher.learnerDataVersion,empty_confirmation:c._count.learners===0,completed_ack:true,confirmation_password:body.confirmation_password,deletion_reason:body.deletion_reason},null,admin);if(c._count.learners){const backup=await tx.classArchive.findFirst({where:{sourceSectionId:c.id,teacherId:c.teacherId,purgedAt:null},orderBy:{createdAt:'desc'},select:{id:true}});if(!backup)throw workspaceError('The section backup could not be retained.',409);recoveryArchiveId=backup.id;}}
   await tx.schoolSection.update({where:{id},data:{deletedAt:new Date(),expiresAt:new Date(Date.now()+30*86400000),recoveryClassId:old.classes[0]?.id||null,recoveryArchiveId}});
  }else if(['add','rename'].includes(body.section_action)){
   const name=sectionName(body.name),nameKey=name.toLowerCase();if(await tx.schoolSection.findFirst({where:{startYear:year.startYear,nameKey,deletedAt:null,...(old?{id:{not:id}}:{})}}))throw workspaceError('This section already exists in this school year.',409);
   if(old){for(const c of old.classes){await tx.classSection.update({where:{id:c.id},data:{name,nameKey}});await tx.learner.updateMany({where:{classSectionId:c.id},data:{section:name}});}await tx.schoolSection.update({where:{id},data:{name,nameKey}});}else await tx.schoolSection.create({data:{schoolId:admin.schoolId,startYear:year.startYear,name,nameKey}});
  }else throw workspaceError('Choose a section action.');
  await writeAudit(tx,{actorId:admin.id,event:'section.settings.changed',detail:{action:body.section_action,startYear:year.startYear}});return {status:'ok'};
 });
}
export async function assignSchoolSection(body,coordinator){
 if(coordinator.role!=='reading_coordinator')throw workspaceError('Reading Coordinator access required.',403);
 return prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(177631,3)::text AS locked`;
  const year=await active(tx,body.start_year),id=String(body.section_id||'');if(!UUID_PATTERN.test(id))throw workspaceError('Choose a section.');await tx.$queryRaw`SELECT id FROM public.school_sections WHERE id=${id}::uuid FOR UPDATE`;
  const definition=await tx.schoolSection.findFirst({where:{id,startYear:year.startYear,deletedAt:null},include:{classes:{where:{deletedAt:null},include:{_count:{select:{learners:true}}}}}});if(!definition)throw workspaceError('Choose a section created by your school administrator.',404);
  const teacherId=Number(body.teacher_id)||null,owner=teacherId?await tx.user.findFirst({where:{id:teacherId,role:'teacher',isActive:true}}):null;if(teacherId&&!owner)throw workspaceError('Choose a teacher in your school.',404);
  const prior=definition.classes[0];if(prior?.teacherId===teacherId)return {status:'ok'};
  if(prior){if(prior._count.learners||await tx.assessmentSession.count({where:{teacherId:prior.teacherId,learner:{classSectionId:prior.id}}}))throw workspaceError('This section has learner records. Keep its assigned teacher to preserve ownership.',409);await tx.classSection.update({where:{id:prior.id},data:{deletedAt:new Date()}});}
  if(owner){let ownedYear=await tx.schoolYear.findFirst({where:{teacherId, startYear:year.startYear,deletedAt:null}});if(!ownedYear)ownedYear=await tx.schoolYear.create({data:{teacherId,schoolId:coordinator.schoolId,startYear:year.startYear,label:schoolYearLabel(year.startYear)}});await tx.classSection.create({data:{teacherId,schoolYearId:ownedYear.id,schoolSectionId:id,name:definition.name,nameKey:definition.nameKey}});}
  await writeAudit(tx,{actorId:coordinator.id,teacherId,event:'section.assigned',detail:{startYear:year.startYear,classSectionId:id,targetName:owner?.fullName||'Unassigned'}});return {status:'ok'};
 });
}
export async function manageSchoolAssessment(body,coordinator){
 if(coordinator.role!=='reading_coordinator')throw workspaceError('Reading Coordinator access required.',403);
 if(!['BoSY','MoSY','EoSY'].includes(body.period))throw workspaceError('Choose BoSY, MoSY or EoSY.');
 return prisma.$transaction(async tx=>{
  await lockSharedLibrary(tx);await refreshSchoolScheduleState(tx);const year=await active(tx,body.start_year),schoolId=schoolScope();
  const head=await tx.assessmentLibraryHead.findUnique({where:{period:body.period}});if(!head)throw workspaceError('Save assessment contents for this timeline before creating its assessment.',409);
  const where={schoolId_startYear_period:{schoolId,startYear:year.startYear,period:body.period}},old=await tx.schoolAssessment.findUnique({where});
  const requireRevision=()=>{if(Number(body.expected_revision)!==(old?.revision||0))throw workspaceError('This assessment changed in another window. Refresh first.',409);};
  const assertExclusive=async()=>{const other=await tx.schoolAssessment.findFirst({where:{startYear:year.startYear,period:{not:body.period},isLive:true}});if(other)throw workspaceError(SINGLE_LIVE_NOTICE,409);};
  let saved;const save=async data=>saved=await (old?tx.schoolAssessment.update({where,data:{...data,catalogRevisionId:head.revisionId,revision:{increment:1}}}):tx.schoolAssessment.create({data:{schoolId,startYear:year.startYear,period:body.period,catalogRevisionId:head.revisionId,createdBy:coordinator.id,...data}}));
  if(body.assessment_action==='schedule'){
   requireRevision();const enabled=body.schedule_enabled;if(typeof enabled!=='boolean')throw workspaceError('Choose whether to enable the schedule.');
   if(enabled){
    const now=new Date();let start,end;
    if(Object.hasOwn(body,'starts_at')||Object.hasOwn(body,'ends_at')){
     const valid=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/.test(v)&&dateOnly(v.slice(0,10))===v.slice(0,10)&&Number.isFinite(Date.parse(v));
     if(body.starts_at&&!valid(body.starts_at)||body.ends_at&&!valid(body.ends_at))throw workspaceError('Choose valid dates and times.');
     if(!body.starts_at&&!body.ends_at)throw workspaceError('Choose a start or stop date and time.');
     start=body.starts_at||now.toISOString();end=body.ends_at||null;
    }else{
     if(typeof body.starts_on!=='string'||typeof body.ends_on!=='string'||body.starts_on.length!==10||body.ends_on.length!==10)throw workspaceError('Choose valid calendar dates.');
     const issue=scheduleIssue(body.starts_on,body.ends_on);if(issue)throw workspaceError(issue);
     start=scheduleInstant(body.starts_on,'00:00');end=new Date(Date.parse(scheduleInstant(body.ends_on,'00:00'))+86400000).toISOString();
    }
    const issue=instantIssue(start,end);if(issue)throw workspaceError(issue);
    const others=await tx.schoolAssessment.findMany({where:{startYear:year.startYear,period:{not:body.period},scheduleEnabled:true}});
    if(others.some(row=>windowsOverlap({startsAt:start,endsAt:end},row)))throw workspaceError('These dates and times overlap another timeline. Choose a separate time range.',409);
    const data={scheduleEnabled:true,schedulePaused:false,startsAt:new Date(start),endsAt:end?new Date(end):null,startsOn:new Date(manilaDay(start)+'T00:00:00Z'),endsOn:end?new Date(manilaDay(Date.parse(end)-1)+'T00:00:00Z'):null};
    data.isLive=scheduledWindowOpen(data);if(data.isLive)await assertExclusive();await save(data);
   }else{if(!old)throw workspaceError('There is no schedule to remove.',409);const live=scheduleIsLive(old);await save({scheduleEnabled:false,schedulePaused:false,startsOn:null,endsOn:null,startsAt:live?(old.startsAt||new Date()):null,endsAt:null,isLive:live});}
  }else if(body.assessment_action==='activate'||body.assessment_action==='toggle'){
   requireRevision();if(typeof body.is_live!=='boolean'||body.assessment_action==='toggle'&&!old)throw workspaceError('Choose an existing assessment.');
   if(body.is_live)await assertExclusive();
   if(old?.scheduleEnabled){if(body.is_live&&!scheduledWindowOpen({...old,schedulePaused:false}))throw workspaceError('This timeline is outside its scheduled dates and times. Edit or clear the schedule first.',409);await save({schedulePaused:!body.is_live,isLive:body.is_live});}
   else{if(!old&&!body.is_live)throw workspaceError('This timeline is not live.',409);await save({isLive:body.is_live,...(body.is_live&&!old?.isLive?{startsAt:new Date(),endsAt:null}:{})});}
  }else if(body.assessment_action==='create'){if(old)throw workspaceError('This assessment already exists for this school year.',409);await save({isLive:false});}
  else throw workspaceError('Choose an assessment action.');
  await writeAudit(tx,{actorId:coordinator.id,event:'assessment.activation.changed',detail:{startYear:year.startYear,period:body.period,action:body.assessment_action,isLive:saved?.isLive??false,...(body.assessment_action==='schedule'?{scheduleEnabled:body.schedule_enabled,startsAt:saved?.startsAt?.toISOString()||null,endsAt:saved?.endsAt?.toISOString()||null}:{})}});const now=Date.now();return {status:'ok',serverNow:new Date(now).toISOString(),assessment:saved?{...saved,isLive:scheduleIsLive(saved,now),scheduleStatus:scheduleStatus(saved,now),startsOn:dateOnly(saved.startsOn)||null,endsOn:dateOnly(saved.endsOn)||null}:null};
 });
}
