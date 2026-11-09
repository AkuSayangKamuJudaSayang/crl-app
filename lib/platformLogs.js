import {openPrivateData} from './adminHistory';
import {recentAuditWhere} from './auditRetention';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value);
// Called only after fresh platform-admin authorization in /api/access.
export async function readPlatformLogs(db,q,admin){
 if(admin?.role!=='admin'||!admin.schoolId)fail('School administrator access required.',403);
 const schoolId=q.get('school_id')||admin.schoolId;
 if(schoolId!==admin.schoolId)fail('Logs belong to your assigned school.',403);
 if(!/^\d{6}$/.test(schoolId||'')||!await db.school.findUnique({where:{id:schoolId},select:{id:true}}))fail('Choose a registered school.');
 // Include all operational events, and keep administrator sign-ins visible.
 // Teacher and Reading Coordinator sign-ins remain stored for security auditing,
 // but do not crowd this activity feed or its detail endpoint.
 const staff=await db.user.findMany({where:{schoolId,role:{in:['admin','reading_coordinator','teacher']}},select:{id:true,fullName:true,role:true},orderBy:{fullName:'asc'}});
 const adminIds=staff.filter(account=>account.role==='admin').map(account=>account.id);
 const where={...recentAuditWhere(),schoolId,OR:[{event:{not:'login'}},{event:'login',actorId:{in:adminIds}}]};
 // Do not combine other schools or null-school legacy entries in this view.
 const person=q.get('person');if(person){const id=Number(person);if(!staff.some(u=>u.id===id))fail('Choose an account in this category.');where.actorId=id;}
 const id=q.get('id');if(id){if(!uuid(id))fail('Invalid log entry.');const row=await db.adminAuditEvent.findFirst({where:{...where,id}});if(!row)fail('Log entry unavailable.',404);let raw={};try{raw=row.encryptedDetail?openPrivateData(row.encryptedDetail):{};}catch{return {entry:view(row,staff),detail:{unavailable:true}};}
 // Explicit metadata allowlist: credentials, secrets and raw learner payloads never leave this API.
 const detail=Object.fromEntries(['inviteId','code','usedByName','role','schoolId','schoolName','targetName','period','version','startYear','teacherCount','reason','deletionReason','kind','empty','classSectionId','schoolYearId','backupName'].filter(k=>['string','number','boolean'].includes(typeof raw[k])).map(k=>[k,raw[k]]));
 return {entry:view(row,staff),detail};}
 const cursor=q.get('cursor');if(cursor){if(!uuid(cursor))fail('Invalid page cursor.');const anchor=await db.adminAuditEvent.findFirst({where:{...where,id:cursor},select:{createdAt:true,id:true}});if(!anchor)fail('Log page expired. Refresh this category.',409);where.AND=[{OR:[{createdAt:{lt:anchor.createdAt}},{createdAt:anchor.createdAt,id:{lt:anchor.id}}]}];}
 const rows=await db.adminAuditEvent.findMany({where,orderBy:[{createdAt:'desc'},{id:'desc'}],take:11});return {staff,entries:rows.slice(0,10).map(row=>view(row,staff)),next_cursor:rows.length>10?rows[9].id:null};
}
function view(row,staff){return {id:row.id,event:row.event,count:row.entityCount,occurredAt:row.occurredAt,actorId:row.actorId,actorName:row.actorName||staff.find(u=>u.id===row.actorId)?.fullName||'Former account'};}
