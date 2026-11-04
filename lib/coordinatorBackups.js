import crypto from 'node:crypto';
import {prisma} from './prisma';
import {sealPrivateData,openPrivateData,writeAudit,learnerHistoryInclude} from './adminHistory';
import {UUID_PATTERN,workspaceError} from './classWorkspace.mjs';
const KINDS=['backup','records_backup'];
const select={id:true,actorId:true,teacherId:true,kind:true,entityCount:true,backupName:true,backupTeacherIds:true,createdAt:true,expiresAt:true};
const valid=()=>({kind:{in:KINDS},expiresAt:{gt:new Date()}});
function authorize(admin){if(!['admin','reading_coordinator'].includes(admin?.role))throw workspaceError('Administrator sign-in is required.',403);}
function nameOf(value){if(typeof value!=='string'||!value.trim()||value.trim().length>100||/[\u0000-\u001f\u007f]/.test(value))throw workspaceError('Enter a backup name of 1 to 100 characters.');return value.trim();}
function idOf(value){if(!UUID_PATTERN.test(String(value||'')))throw workspaceError('Choose a valid backup.');return value;}
export async function listCoordinatorBackups(q,admin){
 authorize(admin);let anchor;const cursor=q.get('cursor');if(cursor){try{if(cursor.length>350)throw Error();anchor=JSON.parse(Buffer.from(cursor,'base64url'));if(!UUID_PATTERN.test(anchor.id)||!Number.isFinite(Date.parse(anchor.at)))throw Error();}catch{throw workspaceError('Refresh Backups before loading more.');}}
 const rows=await prisma.adminRecoveryItem.findMany({where:{...valid(),...(anchor?{OR:[{createdAt:{lt:new Date(anchor.at)}},{createdAt:new Date(anchor.at),id:{lt:anchor.id}}]}:{})},orderBy:[{createdAt:'desc'},{id:'desc'}],take:26,select});
 const page=rows.slice(0,25),ids=[...new Set(page.flatMap(r=>r.backupTeacherIds?.length?r.backupTeacherIds:r.teacherId?[r.teacherId]:[]))],teachers=ids.length?await prisma.user.findMany({where:{id:{in:ids}},select:{id:true,fullName:true}}):[],names=new Map(teachers.map(t=>[t.id,t.fullName]));
 const entries=page.map(r=>({...r,teachers:(r.backupTeacherIds?.length?r.backupTeacherIds:r.teacherId?[r.teacherId]:[]).map(id=>({id,fullName:names.get(id)||'Former teacher'})),backupName:r.backupName||'Earlier backup'})),last=page.at(-1);
 return {entries,next_cursor:rows.length>25?Buffer.from(JSON.stringify({id:last.id,at:last.createdAt.toISOString()})).toString('base64url'):null};
}
export async function coordinatorBackupDownload(id,admin){
 authorize(admin);idOf(id);const row=await prisma.adminRecoveryItem.findFirst({where:{id,...valid()}});if(!row)throw workspaceError('This backup expired or is unavailable.',404);
 const name=row.backupName||'Earlier backup',safe=name.normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-|-$/g,'').slice(0,70)||'crl-records';
 return {filename:`${safe}-${row.id.slice(0,8)}.crlbackup`,backup:{format:row.kind==='records_backup'?'crl-admin-records-backup-v2':'crl-admin-backup-v1',name,created_at:row.createdAt,expires_at:row.expiresAt,encrypted_backup:row.encryptedSnapshot}};
}
export async function manageCoordinatorBackup(body,admin){
 authorize(admin);const action=body.backup_action;
 if(['rename','delete'].includes(action)){
  const id=idOf(body.id),name=action==='rename'?nameOf(body.name):null;
  return prisma.$transaction(async tx=>{const changed=action==='rename'?await tx.adminRecoveryItem.updateMany({where:{id,...valid()},data:{backupName:name}}):await tx.adminRecoveryItem.deleteMany({where:{id,...valid()}});if(changed.count!==1)throw workspaceError('This backup expired or is unavailable.',404);await writeAudit(tx,{actorId:admin.id,teacherId:null,event:action==='rename'?'backup.renamed':'backup.deleted',detail:{backupId:id}});return {status:'ok'};});
 }
 if(action!=='create')throw workspaceError('Choose a valid backup action.');
 const id=idOf(body.request_id),name=nameOf(body.name),all=body.scope==='all';if(!['all','selected'].includes(body.scope))throw workspaceError('Choose teachers for this backup.');
 const raw=body.teacher_ids;if(!all&&(!Array.isArray(raw)||!raw.length||raw.length>500||raw.some(id=>!Number.isSafeInteger(id)||id<1)||new Set(raw).size!==raw.length))throw workspaceError('Select 1 to 500 different registered teachers.');
 const ids=all?[]:[...raw].sort((a,b)=>a-b),digest=crypto.createHash('sha256').update(JSON.stringify({name,scope:body.scope,ids})).digest('hex');
 return prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`crl:manual-backup:${id}`}))::text AS locked`;
  const prior=await tx.adminRecoveryItem.findUnique({where:{id}});if(prior){if(+prior.expiresAt<=Date.now())throw workspaceError('This backup request expired. Open Create backup again.',410);if(prior.kind!=='records_backup'||prior.actorId!==admin.id||openPrivateData(prior.encryptedSnapshot).requestDigest!==digest)throw workspaceError('This backup request already belongs to another operation.',409);return {status:'ok',id:prior.id};}
  const teachers=await tx.user.findMany({where:{role:'teacher',...(all?{}:{id:{in:ids}})},select:{id:true,fullName:true,schoolName:true,schoolId:true},orderBy:{id:'asc'}});if(!teachers.length||!all&&teachers.length!==ids.length)throw workspaceError('A selected teacher is unavailable. Refresh the teacher list.',409);
  const teacherIds=teachers.map(t=>t.id),activeYear={teacherId:{in:teacherIds},deletedAt:null,archivedAt:null},activeSection={teacherId:{in:teacherIds},deletedAt:null,archivedAt:null,schoolYear:activeYear};
  const where={teacherId:{in:teacherIds},classSection:activeSection},count=await tx.learner.count({where});if(count>1000)throw workspaceError('These records are too large for one backup. Choose fewer teachers.',413);
  const [schoolYears,sections,learners]=await Promise.all([tx.schoolYear.findMany({where:activeYear}),tx.classSection.findMany({where:activeSection}),tx.learner.findMany({where,include:learnerHistoryInclude,orderBy:{id:'asc'}})]);
  const revisionIds=[...new Set(learners.flatMap(l=>l.assessmentSessions.flatMap(s=>(s.hostSessions||[]).map(h=>h.catalogRevisionId).filter(Boolean))))],revisions=revisionIds.length?await tx.assessmentLibraryRevision.findMany({where:{id:{in:revisionIds}},select:{id:true,period:true,version:true,rows:true}}):[];
  const snapshot={kind:'backup',version:2,requestDigest:digest,teachers,schoolYears,sections,learners,revisions};const encryptedSnapshot=sealPrivateData(snapshot);if(encryptedSnapshot.length>3*1024*1024)throw workspaceError("These records are too large for one downloadable backup. Choose fewer teachers.",413);const expiresAt=new Date(Date.now()+90*86400000);
  await tx.adminRecoveryItem.create({data:{id,actorId:admin.id,teacherId:teacherIds.length===1?teacherIds[0]:null,kind:'records_backup',entityCount:learners.length,backupName:name,backupTeacherIds:teacherIds,encryptedSnapshot,expiresAt}});
  await writeAudit(tx,{actorId:admin.id,teacherId:null,event:'backup.created',count:learners.length,detail:{backupId:id,teacherCount:teacherIds.length}});return {status:'ok',id};
 },{timeout:60000,isolationLevel:'RepeatableRead'});
}
