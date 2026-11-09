const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),{transform}=require('next/dist/build/swc');
(async()=>{
 async function compile(file,deps){
  const module={exports:{}};
  const {code}=await transform(fs.readFileSync(file,'utf8'),{filename:file,jsc:{parser:{syntax:'ecmascript'}},module:{type:'commonjs'}});
  vm.runInNewContext(code,{module,exports:module.exports,require:name=>deps[name]||require(name),process,Date,Number,Error});
  return module.exports;
 }
 const staff=[
  {id:1,fullName:'Synthetic Teacher',role:'teacher'},
  {id:2,fullName:'Synthetic Coordinator',role:'reading_coordinator'},
  {id:3,fullName:'Synthetic Administrator',role:'admin'}
 ];
 const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 const now=Date.now();
 const entry=(n,event='section.inserted',schoolId='123456',actorId=n%3+1)=>({
  id:uuid(n+1),schoolId,actorId,actorName:'Retained Name',
  event,entityCount:1,encryptedDetail:'sealed',
  createdAt:new Date(now-n*1000),occurredAt:new Date(now-n*1000)
 });
 const rows=Array.from({length:12},(_,index)=>entry(index,index===1?'account.registered':index===2?'admin.invite.created':'section.inserted'));
 rows.push(entry(12,'login','123456',1),entry(13,'login','123456',3),entry(14,'school.created','654321',3));
 let query,staffWhere;
 const eventAllowed=(record,where)=>!where.OR||where.OR.some(rule=>
  (typeof rule.event==='string'?record.event===rule.event:record.event!==rule.event.not) &&
  (!rule.actorId?.in||rule.actorId.in.includes(record.actorId)));
 const visible=(record,where)=>record.schoolId===where.schoolId &&
  eventAllowed(record,where) &&
  (where.actorId===undefined||record.actorId===where.actorId) &&
  (!where.id||record.id===where.id);
 const db={
  school:{findUnique:async({where})=>where.id==='123456'?{id:where.id}:null},
  user:{findMany:async args=>(staffWhere=args.where,staff)},
  adminAuditEvent:{
   findFirst:async({where})=>rows.find(record=>visible(record,where))||null,
   findMany:async({where,take})=>{
    query=where;
    return rows.filter(record=>visible(record,where)).filter(record=>{
     if(!where.AND)return true;
     const filter=where.AND[0]?.OR;
     return !filter||filter.some(part=>{
      if(part.createdAt?.lt)return record.createdAt<part.createdAt.lt;
      return record.createdAt.getTime()===part.createdAt.getTime()&&record.id<part.id.lt;
     });
    }).sort((a,b)=>b.createdAt-a.createdAt||b.id.localeCompare(a.id)).slice(0,take);
   }
  }
 };
 const mod=await compile('lib/platformLogs.js',{
  './adminHistory':{openPrivateData:()=>({inviteId:8,code:'USED-SYNTHETIC',usedByName:'Retained Name',passwordHash:'SECRET',twoFactorSecret:'SECRET',learners:[{lrn:'SECRET'}]})},
  './auditRetention':{recentAuditWhere:()=>({occurredAt:{gt:new Date(0)}})}
 });
 const admin={role:'admin',schoolId:'123456'};
 const read=search=>mod.readPlatformLogs(db,new URLSearchParams(search),admin);
 await assert.rejects(()=>mod.readPlatformLogs(db,new URLSearchParams(),{role:'teacher',schoolId:'123456'}));
 for(const search of ['school_id=999999','scope=platform&school_id=999999','person=999']){
  await assert.rejects(()=>read(search));
 }
 const list=await read('');
 assert.equal(query.schoolId,'123456');
 assert.deepEqual(Array.from(query.OR[1].actorId.in),[3]);
 assert.ok(staffWhere.role.in.includes('admin'));
 assert.ok(staffWhere.role.in.includes('reading_coordinator'));
 assert.ok(staffWhere.role.in.includes('teacher'));
 assert.equal(staffWhere.schoolId,'123456');
 assert.equal(list.entries.length,10);
 assert.equal(list.next_cursor,rows[9].id);
 assert.ok(list.entries.every(row=>row.event!=='login'));
 assert.ok(list.entries.some(row=>row.event==='account.registered'));
 assert.ok(list.entries.some(row=>row.event==='admin.invite.created'));
 assert.ok(!list.entries.some(row=>row.id===rows[14].id));
 assert.equal(list.entries[0].actorName,'Retained Name');
 const next=await read('cursor='+list.next_cursor);
 assert.equal(next.entries.length,3);
 assert.ok(next.entries.some(row=>row.id===rows[13].id),'Administrator sign-in should remain available');
 assert.ok(next.entries.every(row=>row.id!==rows[12].id),'Teacher sign-in should stay hidden');
 assert.equal(next.next_cursor,null);
 const oldScope=await read('scope=platform');
 assert.equal(oldScope.entries.length,10);
 assert.equal(query.schoolId,'123456');
 assert.deepEqual(Array.from(query.OR[1].actorId.in),[3]);
 const byAdmin=await read('person=3');
 assert.ok(byAdmin.entries.length>0);
 assert.ok(byAdmin.entries.every(row=>rows.find(raw=>raw.id===row.id)?.actorId===3));
 assert.equal(query.actorId,3);
 const detail=await read('id='+rows[0].id);
 assert.equal(detail.detail.usedByName,'Retained Name');
 assert.equal(detail.detail.code,'USED-SYNTHETIC');
 assert.ok(!JSON.stringify(detail).includes('SECRET'));
 await assert.rejects(()=>read('id='+rows[12].id));
 const adminLogin=await read('id='+rows[13].id);
 assert.equal(adminLogin.entry.event,'login');
 await assert.rejects(()=>read('cursor='+uuid(999)));
 const interfaceCode=fs.readFileSync('components/SystemAdminLogs.jsx','utf8');
 assert.ok(interfaceCode.includes('Activity log'));
 assert.ok(interfaceCode.includes('All accounts'));
 assert.ok(interfaceCode.includes('Routine teacher and coordinator sign-ins are hidden.'));
 assert.ok(!interfaceCode.includes('Log categories'));
 assert.ok(!interfaceCode.includes('schools.map('));
 assert.ok(!interfaceCode.includes('scope=platform'));
 assert.ok(fs.readFileSync('components/SystemAdminDashboard.jsx','utf8').includes('<SystemAdminLogs refreshToken={data} />'));
 const registration=fs.readFileSync('lib/registerAccount.js','utf8');
 assert.ok(registration.indexOf('tx.adminAuditEvent.create')>registration.indexOf('claim.count!==1'));
 assert.ok(registration.includes('usedByName:user.fullName'));
 assert.ok(registration.includes('code:invite.code'));
 assert.ok(registration.includes('sealPrivateData'));
 console.log('PASS administrator logs: automatic combined school-scoped feed, no category picker or staff sign-in noise, with administrator sign-ins preserved, administrator/teacher/coordinator account filter, no cross-school or hidden-login detail access, ten-entry pagination, encrypted detail allowlist and retained signup audit.');
})().catch(error=>{console.error(error);process.exit(1)});
