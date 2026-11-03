import {optionalDeletionReason} from './classWorkspace.mjs';
import {createHash} from 'node:crypto';
import {normalizeEnrollment,validateEnrollmentConflicts} from './coordinatorEnrollment.mjs';
import {UUID_PATTERN} from './classWorkspace.mjs';
import {prisma} from './prisma';
import {requireClass,lockClass,assertRosterVersion} from './classWorkspaces';
import {learnerIdentityConflict,validateLearnerDeletion,workspaceError} from './classWorkspace.mjs';
import {deleteLearnersWithRecovery,writeAudit,sealPrivateData,openPrivateData} from './adminHistory';

// Called only after the separate administrator session has been verified.
export async function manageCoordinatorRoster(owner,body,admin){
 if(admin?.role!=='admin')throw workspaceError('Reading Coordinator authorization required.',403);
 if(body.roster_action==='add_learners'){
  const items=normalizeEnrollment(body.learners);
  if(!UUID_PATTERN.test(String(body.operation_id||'')))throw workspaceError('Refresh the learner entry form before saving.');
  const groupKey=`enroll:${admin.id}:${owner.id}:${body.operation_id}`;
  const digest=createHash('sha256').update(JSON.stringify({section:body.class_section_id,items})).digest('hex');
  return prisma.$transaction(async tx=>{
   await assertRosterVersion(tx,owner.id,body.roster_version);
   const section=await lockClass(tx,owner.id,body.class_section_id);
   const prior=await tx.adminAuditEvent.findUnique({where:{groupKey}});
   if(prior){if(openPrivateData(prior.encryptedDetail)?.digest!==digest)throw workspaceError('This submission has already been saved. Reopen Add learner for a new batch.',409);return {status:'ok',importedCount:prior.entityCount};}
   validateEnrollmentConflicts(await tx.learner.findMany({where:{teacherId:owner.id}}),items);
   const learners=await tx.learner.createManyAndReturn({data:items.map(v=>({...v,middleName:v.middleName||null,suffix:v.suffix||null,gradeLevel:3,classSectionId:section.id,section:section.name,teacherId:owner.id}))});
   await tx.adminAuditEvent.create({data:{groupKey,actorId:admin.id,teacherId:owner.id,event:'learner.created',entityCount:learners.length,encryptedDetail:sealPrivateData({learners,digest})}});
   return {status:'ok',importedCount:learners.length};
  });
 }
 if(body.roster_action==='add_learner'){
  const value={lrn:String(body.lrn||'').trim(),firstName:String(body.first_name||'').trim().toUpperCase(),lastName:String(body.last_name||'').trim().toUpperCase(),middleName:String(body.middle_name||'').trim().toUpperCase(),suffix:String(body.suffix||'').trim().toUpperCase(),sex:body.sex};
  if(!/^\d{10,12}$/.test(value.lrn)||!value.firstName||!value.lastName||value.firstName.length>50||value.lastName.length>50||value.middleName.length>50||value.suffix.length>20||!['Male','Female'].includes(value.sex))throw workspaceError('Enter a valid LRN, first name, last name and sex.');
  return prisma.$transaction(async tx=>{await assertRosterVersion(tx,owner.id,body.roster_version);const section=await lockClass(tx,owner.id,body.class_section_id);const rows=await tx.learner.findMany({where:{teacherId:owner.id}});if(learnerIdentityConflict(rows,value))throw workspaceError('A learner with this name or LRN already exists across this teacher’s school years and sections.',409);const learner=await tx.learner.create({data:{...value,middleName:value.middleName||null,suffix:value.suffix||null,gradeLevel:3,classSectionId:section.id,section:section.name,teacherId:owner.id}});await writeAudit(tx,{actorId:admin.id,teacherId:owner.id,event:'learner.created',count:1,detail:{learners:[learner]}});return {status:'ok'};});
 }
 if(['delete_learner','delete_learners'].includes(body.roster_action)){
  const ids=[...new Set((body.roster_action==='delete_learner'?[body.learner_id]:body.learner_ids||[]).map(Number))];if(!ids.length||ids.length>500||ids.some(id=>!Number.isSafeInteger(id)||id<=0))throw workspaceError('Select 1 to 500 learners.');
  const section=await requireClass(prisma,owner.id,body.class_section_id,true),learners=await prisma.learner.findMany({where:{teacherId:owner.id,classSectionId:section.id,id:{in:ids}}});if(learners.length!==ids.length)throw workspaceError('A selected learner is no longer in this teacher’s section. Refresh the list.',409);optionalDeletionReason(body);return {status:'ok',...await deleteLearnersWithRecovery(owner.id,ids,body,body.roster_action,admin)};
 }
 throw workspaceError('Choose a valid learner action.');
}
