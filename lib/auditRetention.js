import {SIGN_IN_EVENTS} from './auditEventLabels.mjs';
import {prisma} from './prisma';
export const AUDIT_PAGE_SIZE=10;
export const AUDIT_RETENTION_DAYS=7;
export const auditCutoff=(now=new Date())=>new Date(now.getTime()-AUDIT_RETENTION_DAYS*86400000);
export const recentAuditWhere=(now=new Date())=>({occurredAt:{gt:auditCutoff(now)}});
export async function purgeExpiredAudit(now=new Date()){return prisma.adminAuditEvent.deleteMany({where:{occurredAt:{lte:auditCutoff(now)}}});}
export async function readAuditPage({teacherId=null,cursor=null,now=new Date(),excludeSignIns=false}){
 let anchor=null;if(cursor){try{if(cursor.length>350)throw Error();anchor=JSON.parse(Buffer.from(cursor,'base64url').toString('utf8'));if(!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(anchor.id)||!Number.isFinite(Date.parse(anchor.at)))throw Error();}catch{throw Object.assign(Error('Refresh the activity list before loading more logs.'),{status:400});}}
 const where={AND:[...(excludeSignIns?[{event:{notIn:SIGN_IN_EVENTS}}]:[{NOT:{event:'login',teacherId:null}}]),recentAuditWhere(now),...(teacherId?[{teacherId}]:[]),...(anchor?[{OR:[{occurredAt:{lt:new Date(anchor.at)}},{occurredAt:new Date(anchor.at),id:{lt:anchor.id}}]}]:[])]};
 const rows=await prisma.adminAuditEvent.findMany({where,orderBy:[{occurredAt:'desc'},{id:'desc'}],take:AUDIT_PAGE_SIZE+1,select:{id:true,actorId:true,actorName:true,teacherId:true,event:true,entityCount:true,occurredAt:true,createdAt:true}}),entries=rows.slice(0,AUDIT_PAGE_SIZE),last=entries.at(-1);
 return {entries,next_cursor:rows.length>AUDIT_PAGE_SIZE&&last?Buffer.from(JSON.stringify({id:last.id,at:new Date(last.occurredAt).toISOString()})).toString('base64url'):null};
}
