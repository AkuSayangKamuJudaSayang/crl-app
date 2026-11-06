import {openPrivateData} from './adminHistory';
import {recentAuditWhere} from './auditRetention';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value);
// Called only after fresh platform-admin authorization in /api/access.
export async function readPlatformLogs(db,q){
 const schoolId=q.get('school_id'),platform=q.get('scope')==='platform';
 if(platform&&schoolId)fail('Choose one log category.');
 if(!platform&&(!/^\d{6}$/.test(schoolId||'')||!await db.school.findUnique({where:{id:schoolId},select:{id:true}})))fail('Choose a registered school.');
 const where={...recentAuditWhere(),schoolId:platform?null:schoolId};
 const staff=await db.user.findMany({where:platform?{role:'admin'}:{schoolId,role:{in:['reading_coordinator','teacher']}},select:{id:true,fullName:true,role:true,profilePhoto:true,_count:{select:{classSections:{where:{deletedAt:null,schoolYear:{deletedAt:null}}}}}},orderBy:{fullName:'asc'}});
 // Platform access events only; null-school legacy events never become a joint school view.
 if(platform)where.event={in:['account.registered','login','admin.invite.created','admin.invite.revoked']};
 const person=q.get('person');if(person){const id=Number(person);if(!staff.some(u=>u.id===id))fail('Choose an account in this category.');where.actorId=id;}
 const id=q.get('id');if(id){if(!uuid(id))fail('Invalid log entry.');const row=await db.adminAuditEvent.findFirst({where:{...where,id}});if(!row)fail('Log entry unavailable.',404);let raw={};try{raw=row.encryptedDetail?openPrivateData(row.encryptedDetail):{};}catch{return {entry:view(row,staff),detail:{unavailable:true}};}
 // Explicit metadata allowlist: credentials, secrets and raw learner payloads never leave this API.
 const detail=Object.fromEntries(['inviteId','code','usedByName','role','schoolId','schoolName','targetName','period','version','startYear','teacherCount','reason','deletionReason','kind','empty','classSectionId','schoolYearId','backupName'].filter(k=>['string','number','boolean'].includes(typeof raw[k])).map(k=>[k,raw[k]]));
 return {entry:view(row,staff),detail};}
 const cursor=q.get('cursor');if(cursor){if(!uuid(cursor))fail('Invalid page cursor.');const anchor=await db.adminAuditEvent.findFirst({where:{...where,id:cursor},select:{createdAt:true,id:true}});if(!anchor)fail('Log page expired. Refresh this category.',409);where.AND=[{OR:[{createdAt:{lt:anchor.createdAt}},{createdAt:anchor.createdAt,id:{lt:anchor.id}}]}];}
 const rows=await db.adminAuditEvent.findMany({where,orderBy:[{createdAt:'desc'},{id:'desc'}],take:11});return {staff,entries:rows.slice(0,10).map(row=>view(row,staff)),next_cursor:rows.length>10?rows[9].id:null};
}
function view(row,staff){return {id:row.id,event:row.event,count:row.entityCount,occurredAt:row.occurredAt,actorId:row.actorId,actorName:row.actorName||staff.find(u=>u.id===row.actorId)?.fullName||'Former account'};}
