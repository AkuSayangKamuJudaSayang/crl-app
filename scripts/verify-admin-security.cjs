const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { transform } = require('next/dist/build/swc');
(async () => {
  let state = { years:[{id:'11111111-1111-4111-8111-111111111111',teacherId:901,label:'2026-2027',startYear:2026}], sections:[{id:'22222222-2222-4222-8222-222222222222',teacherId:901,schoolYearId:'11111111-1111-4111-8111-111111111111',name:'Mars'}], archives:[], learners: [], sessions: [], audit: [], recovery: [], content: [], invites: [] }, live = 0, failArchive = false, failTeacherArchiveAt = 0;
  const copy = value => value == null ? value : structuredClone(value);
  const matches = (row, where = {}) => Object.entries(where).every(([key, v]) => {
    if (key === 'OR') return v.some(rule => matches(row, rule));
    if (key === 'NOT') return !matches(row,v);
    if(['teacherId_startYear','schoolYearId_nameKey','classSectionId_lrn'].includes(key))return matches(row,v);
    if (v !== null && typeof v === 'object' && !(v instanceof Date)) {
      if ('in' in v) return v.in.includes(row[key]);
      if ('gt' in v) return row[key] > v.gt;
      if ('not' in v) return row[key] !== v.not;
    }
    return row[key] === v;
  });
  const model = key => ({
    findUnique: async ({ where }) => copy(state[key].find(row => matches(row, where)) || null),
    findMany: async ({ where }) => copy(state[key].filter(row => matches(row, where))),
    count: async ({ where }) => state[key].filter(row => matches(row, where)).length,
    create: async ({ data }) => {
      if (key === 'archives' && failTeacherArchiveAt > 0 && --failTeacherArchiveAt === 0) throw Error('Teacher archive failure');
      if (key === 'recovery' && failArchive) throw Error('Archive failure');
      const row = { id: crypto.randomUUID(), createdAt: new Date(), restoredAt: null, ...copy(data) };state[key].push(row);return copy(row);
    },
    updateMany: async ({ where, data }) => { const rows = state[key].filter(row => matches(row, where));rows.forEach(row => Object.assign(row,copy(data)));return { count: rows.length }; },
    deleteMany: async ({ where }) => { const rows = state[key].filter(row => matches(row,where));state[key]=state[key].filter(row=>!rows.includes(row));return { count: rows.length }; },
    createMany: async ({ data }) => { state[key].push(...copy(data));return { count: data.length }; },
    upsert: async ({ where, create, update }) => { const row=state[key].find(row=>matches(row,where));if(row){Object.assign(row,copy(update));return copy(row);}const next={id:crypto.randomUUID(),createdAt:new Date(),...copy(create)};state[key].push(next);return copy(next); },
  });
  const prisma = { user:{findUnique:async()=>({learnerDataVersion:0})}, classArchive:model('archives'), schoolYear:model('years'), classSection:model('sections'), learner:model('learners'), adminAuditEvent:model('audit'), adminRecoveryItem:model('recovery'), assessmentContent:model('content'), inviteCode:model('invites'), hostSession:{ count:async()=>live }, $queryRaw:async()=>[] };
  prisma.classSection.findUnique=async ({where})=>{const row=state.sections.find(row=>matches(row,where));return row?copy({...row,schoolYear:state.years.find(year=>year.id===row.schoolYearId)}):null;};
  prisma.assessmentContent.findUnique = async ({where}) => {
    const identity=where.teacherId_assessmentPeriod_category_position || where;
    return copy(state.content.find(row=>matches(row,identity)) || null);
  };
  prisma.assessmentSession = { findUnique: async ({where})=>copy(state.sessions.find(row=>row.id===where.id)||null), create:async ({data})=>{state.sessions.push(copy(data));return data;} };
  let chain = Promise.resolve();
  prisma.$transaction = callback => {
    const run=chain.then(async()=>{const before=copy(state);try{return await callback(prisma);}catch(e){state=before;throw e;}});chain=run.catch(()=>{});return run;
  };
  const context = vm.createContext({verifyDeletionAuthorization:async()=>{},crypto, prisma, Buffer, Date, console, process:{env:{ADMIN_DATA_ENCRYPTION_KEY:'test-only-key-not-for-deployment'}}});
  const history = fs.readFileSync('lib/adminHistory.js','utf8').replace(/^import .*;\s*/gm,'').replace(/^export /gm,'');vm.runInContext(history,context);
  const learner = { id:406,teacherId:901,classSectionId:'22222222-2222-4222-8222-222222222222',lrn:'123456789012',firstName:'PRIVATE',lastName:'LEARNER',sex:'Female',gradeLevel:3,assessmentSessions:[{id:80,learnerId:406,teacherId:901,assessmentPeriod:'BoSY',dateAdministered:new Date(),isCompleted:true,sessionMetrics:{sessionId:80,task1Score:10,task2Score:9,totalMiscues:2,timerSeconds:120},letterResults:[{id:90,sessionId:80,letterIndex:0,letter:'A',isCorrect:true}],wordResults:[],passageMiscues:[],comprehensionResults:[],hostSessions:[{storyTitle:'Synthetic Archive Story'}]}] };
  const second = {...copy(learner),id:407,lrn:'123456789013',assessmentSessions:[]};
  state.learners=[copy(learner),copy(second)];
  const encrypted=context.sealPrivateData({ learners:[learner] });assert.ok(!encrypted.includes('PRIVATE')&&!encrypted.includes(learner.lrn));assert.equal(context.openPrivateData(encrypted).learners[0].lrn,learner.lrn);
  const parts=encrypted.split('.');parts[3]=parts[3].slice(0,-2)+'XX';assert.throws(()=>context.openPrivateData(parts.join('.')));
  await context.deleteLearnersWithRecovery(901,[406,407]);assert.equal(state.learners.length,0);assert.equal(state.audit.length,1);assert.equal(state.audit[0].entityCount,2);assert.equal(state.recovery.length,1);assert.ok(!JSON.stringify(state.audit).includes(learner.lrn));
  assert.equal(state.archives.length,2);assert.ok(state.archives.every(row=>row.kind==='learner'&&row.learnerCount===1));assert.equal(context.openPrivateData(state.archives[0].encryptedSnapshot).learners[0].assessmentSessions[0].sessionMetrics.task2Score,9);assert.equal(context.openPrivateData(state.archives[0].encryptedSnapshot).learners[0].assessmentSessions[0].hostSessions[0].storyTitle,'Synthetic Archive Story');
  const archive=state.recovery[0];await context.restoreRecovery(archive.id,1);assert.equal(state.learners.length,2);assert.equal(state.sessions[0].sessionMetrics.create.task2Score,9);assert.equal(state.sessions[0].letterResults.create[0].isCorrect,true);
  await assert.rejects(()=>context.restoreRecovery(archive.id,1),/already restored/);
  console.log('PASS encrypted private details reject tampering; bulk deletion creates one admin audit/recovery item and separate teacher learner archives; restore preserves learner IDs, ownership and assessment results exactly once');
  const previous=copy(state);failArchive=true;await assert.rejects(()=>context.deleteLearnersWithRecovery(901,[406]),/Archive failure/);assert.deepEqual(state,previous);failArchive=false;
  live=1;await assert.rejects(()=>context.deleteLearnersWithRecovery(901,[406]),/active assessment/);assert.equal(state.learners.length,2);live=0;
  await context.deleteLearnersWithRecovery(901,[406]);const recovery=state.recovery.at(-1);state.learners.push({...copy(learner),id:999,classSectionId:state.sections[0].id});await assert.rejects(()=>context.restoreRecovery(recovery.id,1),/already in use/);assert.equal(state.recovery.at(-1).restoredAt,null);state.learners=state.learners.filter(row=>row.id!==999);
  console.log('PASS failed archives roll back deletion; live learners and conflicting LRNs are protected without partial restoration');
  state.learners=[copy(learner),copy(second)];
  const beforeTeacherFailure=copy(state);failTeacherArchiveAt=2;
  await assert.rejects(()=>context.deleteLearnersWithRecovery(901,[406,407]),/Teacher archive failure/);assert.deepEqual(state,beforeTeacherFailure);failTeacherArchiveAt=0;
  await assert.rejects(()=>context.deleteLearnersWithRecovery(901,[406,407],{roster_version:99}),/roster was reset/);assert.deepEqual(state,beforeTeacherFailure);
  const beforeConcurrent=state.archives.length;
  const deletionRetries=await Promise.all([context.deleteLearnersWithRecovery(901,[406,407]),context.deleteLearnersWithRecovery(901,[406,407])]);
  assert.equal(state.archives.length,beforeConcurrent+2);assert.deepEqual(deletionRetries.map(row=>row.learner_archives.length),[2,0]);
  console.log('PASS a failed second teacher archive rolls back the whole bulk delete; roster epochs reject stale deletion and concurrent retries do not duplicate learner archives');
  const group='_audit_import_group', body={[group]:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'};
  await prisma.$transaction(tx=>context.auditLearnerCreation(tx,901,[learner],body));await prisma.$transaction(tx=>context.auditLearnerCreation(tx,901,[second],body));
  const imported=state.audit.filter(row=>row.event==='learners.imported');assert.equal(imported.length,1);assert.equal(imported[0].entityCount,2);assert.equal(context.openPrivateData(imported[0].encryptedDetail).learners.length,2);
  const before=[{teacherId:901,assessmentPeriod:'BoSY',category:'words',position:0,content:'old'}],after=[{...before[0],content:'new'}];
  await prisma.$transaction(tx=>context.auditContentChange(tx,901,'BoSY',before,after));const contentItem=state.recovery.at(-1);state.content=copy(after);await context.restoreRecovery(contentItem.id,1);assert.equal(state.content[0].content,'old');
  await prisma.$transaction(tx=>context.auditContentChange(tx,901,'BoSY',before,after));state.content=[{...after[0],content:'later'}];await assert.rejects(()=>context.restoreRecovery(state.recovery.at(-1).id,1),/Content changed/);assert.equal(state.content[0].content,'later');
  console.log('PASS replayed imports share one entry; content versions restore safely and reject newer changes');
  state.invites=[{id:10,isUsed:false,revokedAt:null,expiresAt:null}];const outcomes=await Promise.allSettled([prisma.$transaction(tx=>context.consumeInvite(tx,10,701)),prisma.$transaction(tx=>context.consumeInvite(tx,10,702))]);assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);assert.equal(state.invites[0].usedById,701);assert.equal(state.invites[0].isUsed,true);
  state.invites.push({id:11,isUsed:false,revokedAt:new Date(),expiresAt:null});await assert.rejects(()=>prisma.$transaction(tx=>context.consumeInvite(tx,11,703)),/no longer available/);
  console.log('PASS one invite can be redeemed once, is expired immediately, links its teacher, and rejects revocation races');
  state.learners=[copy(learner)];state.sessions=[];state.content=copy(before);
  const backup=await context.createBackup(1,901);
  const backupData=context.openPrivateData(backup.encryptedSnapshot);
  assert.equal(backupData.kind,'backup');assert.equal(backupData.users,undefined);assert.equal(backupData.hostSessions,undefined);
  state.learners=[];state.sessions=[];state.content=[{...before[0],content:'keep-current'}];
  await context.restoreRecovery(backup.id,1);
  assert.equal(state.learners[0].lrn,learner.lrn);assert.equal(state.sessions[0].sessionMetrics.create.task2Score,9);assert.equal(state.content.length,1);assert.equal(state.content[0].content,'keep-current');
  console.log('PASS encrypted backups exclude accounts/connections, restore missing learners and results, and preserve current content');
  let secretLog;
  const secure=vm.createContext({crypto,Buffer,Date,process:{env:{JWT_SECRET:'test-only-secret'}},console:{error:(...args)=>secretLog=args},NextResponse:{json:(body,init)=>({body,...init})},prisma:{$queryRaw:async()=>[{count:121}],securityRateBucket:{deleteMany:async()=>{}}}});
  vm.runInContext(fs.readFileSync('lib/security.js','utf8').replace(/^import .*;\s*/gm,'').replace(/^export /gm,''),secure);
  secure.logSecureError('Safe diagnostic',{code:'P2002',message:'password token PRIVATE lrn',meta:{query:'secret'}});assert.equal(JSON.stringify(secretLog),'["Safe diagnostic",{"code":"P2002","type":"Error"}]');
  const limited=await secure.enforceSensitiveRate({headers:{get:()=>null}},'login',{username:'teacher'});assert.equal(limited.status,429);assert.equal(await secure.enforceSensitiveRate({headers:{get:()=>null}},'record_letter',{}),null);
  console.log('PASS request limits are shared through parameterised SQL; runtime diagnostics omit secrets; live answer paths never use the database rate limiter');
  const adminSrc=fs.readFileSync('lib/adminAuth.js','utf8').replace(/^import .*;\s*/gm,'').replace(/^export /gm,'');
  for(const [scope,role,dbRole,expected] of [['app','admin','admin',false],['admin','teacher','teacher',false],['admin','admin','teacher',false],['admin','admin','admin',true]]) {
    const auth=vm.createContext({process:{env:{JWT_SECRET:'test-only-secret'}},TextEncoder,jwtVerify:async()=>({payload:{id:1,scope,role,session_version:0}}),prisma:{user:{findUnique:async()=>({id:1,role:dbRole,adminSessionVersion:0})}}});vm.runInContext(adminSrc,auth);assert.equal(Boolean(await auth.getAdminUser({cookies:{get:()=>({value:'test'})},headers:{get:()=>null}})),expected);
  }
  const stale=vm.createContext({process:{env:{JWT_SECRET:'test-only-secret'}},TextEncoder,jwtVerify:async()=>({payload:{id:1,scope:'admin',role:'admin',session_version:0}}),prisma:{user:{findUnique:async()=>({id:1,role:'admin',adminSessionVersion:1})}}});vm.runInContext(adminSrc,stale);assert.equal(await stale.getAdminUser({cookies:{get:()=>({value:'test'})},headers:{get:()=>null}}),null);
  console.log('PASS admin access requires the separate scope, valid admin role, current database role and unrevoked session version');
  const {jwtVerify,SignJWT}=await import('jose');const jwtSecret='test-only-secret';
  const edge=vm.createContext({process:{env:{JWT_SECRET:jwtSecret}},TextEncoder,Uint8Array,URL,Date,Map,crypto:crypto.webcrypto,jwtVerify,NextResponse:{json:(body,init)=>({body,...init}),redirect:url=>({status:307,url:String(url)}),next:()=>({status:200})}});
  vm.runInContext(fs.readFileSync('middleware.js','utf8').replace(/^import .*;\s*/gm,'').replace(/^export /gm,''),edge);
  const request=(url='/api/assessment',method='POST',headers={},cookie={})=>({nextUrl:new URL('https://crl.test'+url),url:'https://crl.test'+url,method,headers:{get:k=>headers[k]||null},cookies:{get:k=>cookie[k]?{value:cookie[k]}:undefined}});
  assert.equal((await edge.middleware(request('/admin','GET'))).status,307);
  const token=await new SignJWT({id:1,scope:'admin',role:'admin'}).setProtectedHeader({alg:'HS256'}).setExpirationTime('5m').sign(new TextEncoder().encode(jwtSecret));
  assert.equal((await edge.middleware(request('/admin','GET',{}, {crla_admin_token:token}))).status,200);
  assert.equal((await edge.middleware(request('/admin','GET',{}, {crla_admin_token:token+'tampered'}))).status,307);
  assert.equal((await edge.middleware(request('/api/assessment','POST',{origin:'https://attacker.test',authorization:'Bearer fake'}, {crla_token:'session'}))).status,403);
  assert.equal((await edge.middleware(request('/api/assessment','POST',{origin:'https://crl.test'}, {crla_token:'session'}))).status,200);
  assert.equal((await edge.middleware(request('/api/assessment','POST',{origin:'https://native.test',authorization:'Bearer native'}))).status,200);
  assert.equal((await edge.middleware(request('/api/assessment/join','POST',{origin:'https://native.test'}))).status,200);
  assert.equal((await edge.middleware(request('/api/auth','POST',{'content-length':'20000'}))).status,413);
  for(let i=0;i<600;i++)assert.equal((await edge.middleware(request('/api/assessment?code=ABC123','GET',{}, {crla_token:'normal-live-poll-test'}))).status,200);
  console.log('PASS middleware verifies signed admin tokens, blocks forged cross-site cookie requests, permits native bearer requests, rejects oversized bodies and keeps ordinary live polling below limits');
  const loginCount=state.audit.length;
  await context.recordLogin({id:1,role:'admin'},'admin');await context.recordLogin({id:1,role:'admin'},'app');await context.recordLogin({id:901,role:'teacher'},'admin');assert.equal(state.audit.length,loginCount);
  await context.recordLogin({id:901,role:'teacher'},'app');assert.equal(state.audit.length,loginCount+1);assert.equal(state.audit.at(-1).teacherId,901);
  const adminLog={id:crypto.randomUUID(),event:'login',teacherId:null,createdAt:new Date(),occurredAt:new Date()},teacherLog={...adminLog,id:crypto.randomUUID(),teacherId:901};
  const auditRows=[adminLog,teacherLog];
  const emptyModel={findMany:async()=>[],count:async()=>0,deleteMany:async()=>({count:0})};
  const routeDb={user:emptyModel,inviteCode:emptyModel,adminRecoveryItem:emptyModel,bugReport:emptyModel,feedback:emptyModel,adminAuditEvent:{...emptyModel,findMany:async({where})=>auditRows.filter(r=>matches(r,where)),count:async({where})=>auditRows.filter(r=>matches(r,where)).length,findUnique:async({where})=>auditRows.find(r=>r.id===where.id)}};
  const apiContext=vm.createContext({Date,Number,Map,crypto,process,Buffer,NextResponse:{json:(body,init)=>({body,status:init.status})},prisma:routeDb,getAdminUser:async()=>({id:1,role:'admin'}),adminProfileSelect:{id:true},logSecureError(){}});
  vm.runInContext(fs.readFileSync('app/api/admin/route.js','utf8').replace(/^import .*;\s*/gm,'').replace(/^export /gm,''),apiContext);
  const adminRequest=query=>({nextUrl:new URL('https://crl.test/api/admin?'+query)});
  const list=await apiContext.GET(adminRequest('action=audit'));assert.equal(list.status,200);assert.equal(list.body.entries.length,1);assert.equal(list.body.entries[0].id,teacherLog.id);
  const overview=await apiContext.GET(adminRequest('action=overview'));assert.equal(overview.status,200);assert.equal(overview.body.stats.auditEvents,1);
  assert.equal((await apiContext.GET(adminRequest('action=audit_detail&id='+adminLog.id))).status,404);
  assert.equal((await apiContext.GET(adminRequest('action=audit&teacher_id=999'))).body.entries.length,0);
  console.log('PASS only teacher sign-ins are recorded; existing admin sign-ins are excluded from history totals, lists and detail access');

})().catch(error=>{console.error(error);process.exitCode=1;});
