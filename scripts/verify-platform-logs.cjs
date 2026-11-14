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
 rows.push(entry(12,'login','123456',1),entry(13,'login','123456',3),entry(14,'login','123456',2));
 rows.push(entry(15,'school.created','654321',3),entry(16,'section.removed','123456',999));
 let query,staffWhere;
 const visible=(record,where)=>record.schoolId===where.schoolId &&
  (!where.event||!where.event.notIn.includes(record.event)) &&
  (where.actorId===undefined||(typeof where.actorId==='number'
   ?record.actorId===where.actorId:where.actorId.in.includes(record.actorId))) &&
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
  './auditEventLabels.mjs':await import('../lib/auditEventLabels.mjs'),
  './auditRetention':{recentAuditWhere:()=>({occurredAt:{gt:new Date(0)}})}
 });
 const admin={role:'admin',schoolId:'123456'};
 const read=search=>mod.readPlatformLogs(db,new URLSearchParams(search),admin);
 await assert.rejects(()=>mod.readPlatformLogs(db,new URLSearchParams(),{role:'teacher',schoolId:'123456'}));
 for(const search of ['school_id=999999','scope=platform&school_id=999999','person=999','category=admins','category=all']){
  await assert.rejects(()=>read(search));
 }
 const general=await read('category=general');
 assert.equal(query.schoolId,'123456');
 assert.ok(query.event.notIn.includes('login'));assert.ok(query.event.notIn.includes('sign_in'));
 assert.equal(query.actorId,undefined);
 assert.equal(staffWhere.schoolId,'123456');
 assert.ok(staffWhere.role.in.includes('admin'));
 assert.ok(staffWhere.role.in.includes('teacher'));
 assert.ok(staffWhere.role.in.includes('reading_coordinator'));
 assert.equal(general.entries.length,10);
 assert.equal(general.next_cursor,rows[9].id);
 assert.ok(general.entries.every(row=>row.event!=='login'));
 assert.ok(general.entries.some(row=>row.event==='account.registered'));
 assert.ok(general.entries.some(row=>row.event==='admin.invite.created'));
 assert.ok(!general.entries.some(row=>row.id===rows[15].id),'Another school must not be visible');
 const next=await read('category=general&cursor='+general.next_cursor);
 assert.equal(next.entries.length,3);
 assert.ok(next.entries.some(row=>row.id===rows[16].id),'Former accounts retain their general audit history');
 assert.equal(next.next_cursor,null);
 const legacy=await read('scope=platform');
 assert.equal(legacy.entries.length,10);
 assert.equal(query.schoolId,'123456');
 assert.ok(query.event.notIn.includes('login'));assert.ok(query.event.notIn.includes('sign_in'));
 const teacher=await read('category=teacher');
 assert.equal(teacher.entries.length,4);
 assert.deepEqual(Array.from(query.actorId.in),[1]);
 assert.ok(teacher.entries.every(row=>rows.find(raw=>raw.id===row.id)?.actorId===1));
 const coordinator=await read('category=reading_coordinator');
 assert.equal(coordinator.entries.length,4);
 assert.deepEqual(Array.from(query.actorId.in),[2]);
 assert.ok(coordinator.entries.every(row=>rows.find(raw=>raw.id===row.id)?.actorId===2));
 assert.equal((await read('category=general&person=3')).entries.length,4);
 assert.equal(query.actorId,3);
 await assert.rejects(()=>read('category=teacher&person=2'));
 await assert.rejects(()=>read('category=reading_coordinator&person=1'));
 await assert.rejects(()=>read('category=teacher&id='+rows[1].id));
 await assert.rejects(()=>read('category=reading_coordinator&id='+rows[0].id));
 await assert.rejects(()=>read('category=teacher&cursor='+rows[1].id));
 const detail=await read('category=general&id='+rows[0].id);
 assert.equal(detail.detail.usedByName,'Retained Name');
 assert.equal(detail.detail.code,'USED-SYNTHETIC');
 assert.ok(!JSON.stringify(detail).includes('SECRET'));
 for(const n of [12,13,14])await assert.rejects(()=>read('category=general&id='+rows[n].id));
 await assert.rejects(()=>read('category=general&cursor='+uuid(999)));
 const ui=fs.readFileSync('components/SystemAdminLogs.jsx','utf8');
 const css=fs.readFileSync('components/SystemAdmin.module.css','utf8');
 assert.ok(ui.includes('Activity log'));
 assert.ok(ui.includes("label:'General'"));
 assert.ok(ui.includes("label:'Reading Coordinators'"));
 assert.ok(ui.includes("label:'Teachers'"));
 assert.ok(ui.includes('aria-pressed={category===item.value}'));
 assert.ok(ui.includes('category=${encodeURIComponent(category)}'));
 assert.ok(!ui.includes('<select'));
 assert.ok(!ui.includes('setRefreshVersion'));
 assert.ok(!ui.includes('>Refresh</button>'));
 assert.ok(!ui.includes('Log categories'));
 assert.ok(!ui.includes('schools.map('));
 assert.ok(css.includes('.logFeed{box-sizing:border-box;width:100%;max-width:980px;min-width:0;margin:0 auto!important}'));
 assert.ok(css.includes('.logCategoryTabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))'));
 assert.ok(fs.readFileSync('components/SystemAdminDashboard.jsx','utf8').includes('<SystemAdminLogs refreshToken={data} />'));
 const registration=fs.readFileSync('lib/registerAccount.js','utf8');
 assert.ok(registration.includes('tx.adminAuditEvent.create'));
 assert.ok(registration.includes("event: 'account.approval_requested'"));
 assert.ok(registration.includes("approvalStatus: 'pending'"));
 assert.ok(registration.includes('sealPrivateData'));
 assert.ok(!registration.includes('code:invite.code'),'New registrations cannot expose invitation codes');
 console.log('PASS admin activity categories: General / Reading Coordinators / Teachers, all sign-ins hidden without deletion, school scoping, former actor visibility in General, role-locked details and cursors, pagination, encryption allowlist, release UI controls and centered panel.');
})().catch(error=>{console.error(error);process.exit(1)});
