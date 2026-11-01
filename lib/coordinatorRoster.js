import {prisma} from './prisma';
import {requireClass,lockClass,assertRosterVersion} from './classWorkspaces';
import {learnerIdentityConflict,validateLearnerDeletion,workspaceError} from './classWorkspace.mjs';
import {deleteLearnersWithRecovery,writeAudit} from './adminHistory';

// Called only after the separate administrator session has been verified.
export async function manageCoordinatorRoster(owner,body,admin){
 if(admin?.role!=='admin')throw workspaceError('Reading Coordinator authorization required.',403);
 if(body.roster_action==='add_learner'){
  const value={lrn:String(body.lrn||'').trim(),firstName:String(body.first_name||'').trim().toUpperCase(),lastName:String(body.last_name||'').trim().toUpperCase(),middleName:String(body.middle_name||'').trim().toUpperCase(),suffix:String(body.suffix||'').trim().toUpperCase(),sex:body.sex};
  if(!/^\d{10,12}$/.test(value.lrn)||!value.firstName||!value.lastName||value.firstName.length>50||value.lastName.length>50||value.middleName.length>50||value.suffix.length>20||!['Male','Female'].includes(value.sex))throw workspaceError('Enter a valid LRN, first name, last name and sex.');
  return prisma.$transaction(async tx=>{await assertRosterVersion(tx,owner.id,body.roster_version);const section=await lockClass(tx,owner.id,body.class_section_id);const rows=await tx.learner.findMany({where:{teacherId:owner.id}});if(learnerIdentityConflict(rows,value))throw workspaceError('A learner with this name or LRN already exists across this teacher’s school years and sections.',409);const learner=await tx.learner.create({data:{...value,middleName:value.middleName||null,suffix:value.suffix||null,gradeLevel:3,classSectionId:section.id,section:section.name,teacherId:owner.id}});await writeAudit(tx,{actorId:admin.id,teacherId:owner.id,event:'learner.created',count:1,detail:{learners:[learner]}});return {status:'ok'};});
 }
 if(['delete_learner','delete_learners'].includes(body.roster_action)){
  const ids=[...new Set((body.roster_action==='delete_learner'?[body.learner_id]:body.learner_ids||[]).map(Number))];if(!ids.length||ids.length>500||ids.some(id=>!Number.isSafeInteger(id)||id<=0))throw workspaceError('Select 1 to 500 learners.');
  const section=await requireClass(prisma,owner.id,body.class_section_id,true),learners=await prisma.learner.findMany({where:{teacherId:owner.id,classSectionId:section.id,id:{in:ids}}});if(learners.length!==ids.length)throw workspaceError('A selected learner is no longer in this teacher’s section. Refresh the list.',409);const reason=String(body.deletion_reason||"").trim();if(reason.length<5||reason.length>300)throw workspaceError("Provide a deletion reason of 5 to 300 characters.");return {status:'ok',...await deleteLearnersWithRecovery(owner.id,ids,body,body.roster_action,admin)};
 }
 throw workspaceError('Choose a valid learner action.');
}
