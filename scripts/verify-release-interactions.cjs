const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=path=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');
function block(source,marker){const start=source.indexOf(marker);assert.ok(start>=0,marker);const brace=source.indexOf('{',start);let depth=0;for(let i=brace;i<source.length;i++){if(source[i]==='{')depth++;else if(source[i]==='}'&&--depth===0)return source.slice(start,i+1);}throw Error('Missing block');}
(async()=>{
 const guides=await import('../lib/storyComprehension.mjs');
 const content={letters:['Z','A'],words:['zoo'],stories:[{id:1,title:'Test story',text:'Test passage',questions:Array.from({length:6},(_,i)=>({text:'Question '+i,answers:['PRIVATE TEACHER GUIDE']}))}]};
 let host,failContent=false,limited=false,lookups=0;
 function reset(stage='waiting',currentContent='Waiting for learner to connect...'){host={id:1,teacherId:901,learnerId:406,stage,currentContent,storyTitle:null,ended:false,linkedAt:null,learner:{id:406,firstName:'SYNTHETIC'},assessmentSession:{isCompleted:false,assessmentPeriod:'BoSY'}};}
 const ctx=vm.createContext({Response,Date,LETTERS:['M'],normalizeCode:x=>String(x||'').toUpperCase(),
  prisma:{hostSession:{findUnique:async q=>{lookups++;assert.ok(q.select&&!q.include);assert.ok(!q.select.teacher);return structuredClone(host);},updateMany:async({where,data})=>{if(!host||host.ended||host.linkedAt!==null||host.id!==where.id)return{count:0};Object.assign(host,data);return{count:1};}}},
  enforceSensitiveRate:async()=>limited?Response.json({error:'Rate limited'},{status:429}):null,
  requireTeacher:async()=>({userId:901}),invalidateLiveAssessmentContent(){},getLiveAssessmentContent:async()=>{if(failContent)throw Error('content unavailable');return content;},
  ...guides,serializeLearner:x=>({id:x.id,first_name:x.firstName}),responseJson:(data,status=200)=>Response.json(data,{status}),logSecureError(){}
 });
 const route=read('app/api/assessment/route.js');const join=block(route,'  if (\n    action ===\n    "learner_join"');vm.runInContext('async function handle(request,body){const action="learner_join";'+join+'}',ctx);
 for(const [stage,text] of [['waiting','Waiting for learner to connect...'],['letter','Waiting for learner to connect...'],['letter','A'],['word','zoo']]){
  reset(stage,text);const r=await ctx.handle({}, {code:'ABC123'}),data=await r.json();assert.equal(r.status,200);assert.equal(host.currentContent,stage==='word'?'zoo':text==='A'?'A':'Z');assert.equal(data.current_content,host.currentContent);assert.equal(data.stage,host.stage);assert.ok(host.linkedAt);assert.ok(!JSON.stringify(data).includes('PRIVATE TEACHER GUIDE'));
  assert.equal((await ctx.handle({}, {code:'ABC123'})).status,410);
 }
 reset();const outcomes=await Promise.all([ctx.handle({}, {code:'ABC123'}),ctx.handle({}, {code:'ABC123'})]);assert.deepEqual(outcomes.map(x=>x.status).sort(),[200,410]);
 reset();failContent=true;assert.equal((await ctx.handle({}, {code:'ABC123'})).status,500);assert.equal(host.linkedAt,null);failContent=false;assert.equal((await ctx.handle({}, {code:'ABC123'})).status,200);
 reset();host.ended=true;assert.equal((await ctx.handle({}, {code:'ABC123'})).status,410);reset();host.assessmentSession.isCompleted=true;assert.equal((await ctx.handle({}, {code:'ABC123'})).status,410);
 limited=true;const prior=lookups;assert.equal((await ctx.handle({}, {code:'ABC123'})).status,429);assert.equal(lookups,prior);limited=false;
 // Existing joined placeholders heal only through an owned teacher read and
 // an atomic no-results predicate. A raced answer must make repair a no-op.
 let persistedAnswers=0,repairWrites=0;
 ctx.prisma.hostSession.updateManyAndReturn=async({where,data})=>{assert.equal(where.teacherId,901);assert.deepEqual(Object.keys(where.assessmentSession.letterResults),['none']);if(host.currentContent!==where.currentContent||host.ended||persistedAnswers)return[];repairWrites++;Object.assign(host,data);return[{currentContent:host.currentContent,updatedAt:new Date()}];};
 vm.runInContext(block(route,'async function repairJoinedPlaceholder('),ctx);
 reset('letter','Waiting for learner to connect...');host.linkedAt=new Date();assert.equal(await ctx.repairJoinedPlaceholder(host,901,content),true);assert.equal(host.currentContent,'Z');
 assert.equal(await ctx.repairJoinedPlaceholder(host,901,content),false);assert.equal(repairWrites,1);
 for(const option of ['foreign','answered','completed','ended','real-item']){
  reset('letter','Waiting for learner to connect...');host.linkedAt=new Date();persistedAnswers=option==='answered'?1:0;if(option==='completed')host.assessmentSession.isCompleted=true;if(option==='ended')host.ended=true;if(option==='real-item')host.currentContent='A';const writes=repairWrites;assert.equal(await ctx.repairJoinedPlaceholder(host,option==='foreign'?902:901,content),false);assert.equal(repairWrites,writes);
 }
 console.log('PASS existing owned joined placeholders initialize once; scored, completed, ended, foreign and valid in-progress sessions are never rewritten');
 // Public endpoint uses the same handler and cannot forward teacher/replay commands.
 const {NextRequest,NextResponse}=require('next/server');const wrapper=read('app/api/assessment/join/route.js').replace(/^import .*;\s*/gm,'').replace(/^export /gm,'');
 let forwarded;const w=vm.createContext({URL,Headers,NextRequest,NextResponse,assessmentPost:async request=>{forwarded=await request.json();assert.ok(!request.headers.has('cookie'));assert.ok(!request.headers.has('authorization'));return ctx.handle(request,forwarded);}});vm.runInContext(wrapper,w);
 reset();const publicReply=await w.POST(new NextRequest('https://crl.test/api/assessment/join',{method:'POST',headers:{'content-type':'application/json',cookie:'test-secret','authorization':'Bearer test-secret'},body:JSON.stringify({code:'abc123',action:'host_end',_offline_replay:true})}));assert.equal(publicReply.status,200);assert.equal(forwarded.action,'learner_join');assert.equal(forwarded._offline_replay,undefined);assert.equal(host.currentContent,'Z');
 console.log('PASS canonical public and legacy joins share one lightweight atomic claim; actual first item reaches teacher and learner, placeholders disappear, guides stay private, expired/concurrent/rate-limited claims stay guarded, content failure preserves the invitation');
 // Actual DOM click events must not act as confirmation.
 const teacher=read('app/teacher/page.jsx');const bulk=teacher.slice(teacher.indexOf('  const bulkDeleteLearners = async'),teacher.indexOf('  const requestActivityNavigation ='));let opened=0,requests=0,progress=0;
 const b=vm.createContext({selectedLearnerIds:[10,11],setBulkDeleteConfirm:x=>{if(x)opened++;},showToast(){},setDeletingProgress:()=>progress++,api:async()=>{requests++;throw Error('synthetic server rejection');}});vm.runInContext(bulk+';globalThis.remove=bulkDeleteLearners;',b);
 await b.remove({nativeEvent:{type:'click'}});assert.equal(opened,1);assert.equal(requests,0);assert.equal(progress,0);await b.remove();assert.equal(opened,2);assert.equal(requests,0);await b.remove(true,{deletion_authorization:{fixture:true},deletion_reason:'Synthetic test'});assert.equal(requests,1);
 console.log('PASS actual bulk-delete click handler opens confirmation without progress/API writes; only explicit confirmation enters deletion');
 // Public join bypasses teacher IndexedDB, stale tokens and local-first state.
 const runtime=read('app/components/OfflineRuntime.jsx');const runtimeSource=runtime.replace(/^import[\s\S]*?from ["'][^"']+["'];\s*/gm,'').replace('export default function OfflineRuntime','function OfflineRuntime');let credentials,teacherReads=0;
 const cloud=async(input,init)=>{credentials=init.credentials;return Response.json({connected:true,stage:'letter',current_content:'Z'});};
 const rt=vm.createContext({URL,Response,AbortController,setTimeout,clearTimeout,navigator:{onLine:true},window:{location:{origin:'https://crl.test'},fetch:cloud,__crlOriginalFetch:cloud,addEventListener(){},removeEventListener(){},setTimeout,clearTimeout,setInterval(){},clearInterval(){}},useEffect:fn=>fn(),getOfflineTeacherSession:()=>{teacherReads++;throw Error('Teacher storage must not gate public joining');}});
 vm.runInContext(runtimeSource,rt);vm.runInContext('syncOutbox = async () => {}; OfflineRuntime()',rt);const result=await rt.window.fetch('/api/assessment/join',{method:'POST',credentials:'include',body:JSON.stringify({code:'ABC123'})});assert.equal(result.status,200);assert.equal(credentials,'omit');assert.equal(teacherReads,0);
 console.log('PASS real OfflineRuntime public-entry path avoids teacher storage/token/local mutation interception');
})().catch(e=>{console.error(e);process.exitCode=1});
