import {archiveSnapshot,writeAudit} from './adminHistory';
import {isLoginLocked,resolveAccountUnlock} from './loginSecurity';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const positive=value=>{if(!['number','string'].includes(typeof value))return null;const n=Number(value);return Number.isSafeInteger(n)&&n>0&&n<=2147483647?n:null;};
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value);
const admin=actor=>{if(actor?.role!=='admin'||!actor.isActive||!actor.schoolId)fail('System Administrator access required.',403);};
export async function adminSupportGet(db,actor,q){
 admin(actor);const action=q.get('action');
 if(action==='reports'){
  const type=q.get('type')||'bug';if(!['bug','feedback'].includes(type))fail('Choose a valid report type.');
  const cursor=q.get('cursor'),id=cursor?positive(cursor):null;if(cursor&&!id)fail('Invalid page cursor.');
  const model=type==='bug'?db.bugReport:db.feedback;
  const rows=await model.findMany({where:{schoolId:actor.schoolId,...(id?{id:{lt:id}}:{})},orderBy:{id:'desc'},take:51,select:{id:true,name:true,contact:true,message:true,isResolved:true,createdAt:true}});
  return {entries:rows.slice(0,50),next_cursor:rows.length>50?String(rows[49].id):null};
 }
 if(action==='unlock_requests'){
  const cursor=q.get('cursor'),where={teacher:{schoolId:actor.schoolId,role:'teacher'}};
  if(cursor){if(!uuid(cursor))fail('Invalid page cursor.');const anchor=await db.accountUnlockRequest.findFirst({where:{id:cursor,...where},select:{createdAt:true,id:true}});if(!anchor)fail('Refresh the unlock request list.');where.OR=[{createdAt:{lt:anchor.createdAt}},{createdAt:anchor.createdAt,id:{lt:anchor.id}}];}
  const rows=await db.accountUnlockRequest.findMany({where,orderBy:[{createdAt:'desc'},{id:'desc'}],take:51,include:{teacher:{select:{id:true,username:true,fullName:true,section:true,role:true,loginLockedUntil:true,loginLockId:true}}}});
  return {entries:rows.slice(0,50).map(row=>({id:row.id,teacher:{id:row.teacher.id,username:row.teacher.username,fullName:row.teacher.fullName,section:row.teacher.section},created_at:row.createdAt,locked_until:row.lockedUntil,resolved_at:row.resolvedAt,status:row.status==='pending'&&(!isLoginLocked(row.teacher)||row.teacher.loginLockId!==row.lockId)?'expired':row.status})),next_cursor:rows.length>50?rows[49].id:null};
 }
 fail('Unknown support action.');
}
export async function adminSupportPost(db,actor,body){
 admin(actor);const action=body.action;
 if(['approve_unlock','dismiss_unlock'].includes(action)){
  if(!uuid(body.id))fail('Choose a valid unlock request.');
  return resolveAccountUnlock(db,body.id,actor.id,action==='approve_unlock',writeAudit,actor);
 }
 if(!['update_report','delete_report'].includes(action))fail('Unknown support action.');
 const id=positive(body.id);if(!id||!['bug','feedback'].includes(body.type))fail('Choose a valid report.');
 if(action==='update_report'&&typeof body.is_resolved!=='boolean')fail('Choose a valid report status.');
 return db.$transaction(async tx=>{
  const reviewer=await tx.user.findFirst({where:{id:actor.id,role:'admin',schoolId:actor.schoolId,isActive:true,approvalStatus:'approved'},select:{id:true}});if(!reviewer)fail('Your administrator access has changed. Sign in again.',403);
  const model=body.type==='bug'?tx.bugReport:tx.feedback,where={id,schoolId:actor.schoolId},row=await model.findFirst({where});if(!row)fail('Report unavailable.',404);
  if(action==='delete_report'){
   const saved=await archiveSnapshot(tx,{actorId:actor.id,teacherId:null,kind:'report',count:1,snapshot:{kind:'report',type:body.type,row}});
   await writeAudit(tx,{actorId:actor.id,teacherId:null,event:'report.deleted',detail:{recoveryId:saved.id}});
   await model.delete({where});
  }else{await model.update({where,data:{isResolved:body.is_resolved}});await writeAudit(tx,{actorId:actor.id,teacherId:null,event:'report.status.changed',detail:{type:body.type,id,isResolved:body.is_resolved}});}
  return {status:'ok'};
 });
}
