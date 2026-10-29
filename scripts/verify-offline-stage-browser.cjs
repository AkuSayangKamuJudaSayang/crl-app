/* Optional browser integration: real teacher/learner components, OfflineRuntime,
 * IndexedDB and BroadcastChannel. Synthetic records only; all cloud HTTP fails.
 * Separate-context peer/RTC-double coverage is in verify-offline-pairing.cjs.
 * Supply CRL_BROWSER_EXECUTABLE and an environment Playwright installation.
 */
const fs=require('fs'),path=require('path'),os=require('os'),http=require('http'),assert=require('assert/strict');
const req=require('module').createRequire(path.join(process.cwd(),'package.json'));
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'crl-stages-')),root=process.cwd(),swc=req.resolve('next/dist/build/swc');
 fs.writeFileSync(path.join(dir,'jsx.cjs'),`const swc=require(${JSON.stringify(swc)});module.exports=function(source){const done=this.async();if(this.resourcePath.endsWith('/OfflineRuntime.jsx'))source+='\\nexport {handleOfflineAssessment, serializeOfflineMutation};';swc.transform(source,{filename:this.resourcePath,jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'automatic'}}}}).then(r=>done(null,r.code),done);};`);
 fs.writeFileSync(path.join(dir,'css.cjs'),`module.exports=function(source){const names=[...source.matchAll(/\\.([A-Za-z][\\w-]*)/g)].map(m=>m[1]),prefix='qa_'+require('path').basename(this.resourcePath).replace(/\\W/g,'')+'_',map=Object.fromEntries(names.map(n=>[n,prefix+n]));source=source.replace(/:global\\(([^)]+)\\)/g,'$1').replace(/\\.([A-Za-z][\\w-]*)/g,(m,n)=>'.'+map[n]);return 'const style=document.createElement("style");style.textContent='+JSON.stringify(source)+';document.head.append(style);export default '+JSON.stringify(map);};`);
 const entry=`import React from 'react';import {createRoot}from'react-dom/client';import Teacher from ${JSON.stringify(root+'/app/teacher/assessment/AssessmentClient.jsx')};import Learner from ${JSON.stringify(root+'/app/learner/LearnerAssessmentPage.jsx')};import{handleOfflineAssessment,serializeOfflineMutation}from ${JSON.stringify(root+'/app/components/OfflineRuntime.jsx')};import * as db from ${JSON.stringify(root+'/lib/teacherOfflineDb.js')};import * as peer from ${JSON.stringify(root+'/lib/assessmentPeer.js')};import{saveAssessmentState}from ${JSON.stringify(root+'/lib/assessmentOutbox.js')};import{LEARNER_RECOVERY_KEY}from ${JSON.stringify(root+'/lib/assessmentRecovery.mjs')};import{cloneAssessmentContent}from ${JSON.stringify(root+'/lib/assessmentContent.js')};
 window.peer=peer;window.requests=[];window.errors=[];window.addEventListener('unhandledrejection',e=>window.errors.push(String(e.reason)));Object.defineProperty(navigator,'onLine',{get:()=>false});
 const role=new URLSearchParams(location.search).get('role'),code='TST234',content=cloneAssessmentContent().BoSY;content.stories=content.stories.map(story=>({...story,available:Boolean(story.text.trim())}));window.content=content;
 window.fetch=async(input,init={})=>{const url=new URL(typeof input==='string'?input:input.url,location.origin),action=url.searchParams.get('action')||JSON.parse(init.body||'{}').action;if(role==='teacher'&&url.pathname==='/api/assessment'){const response=await serializeOfflineMutation(()=>handleOfflineAssessment(action,init,url));if(action!=='host_get'){const reply=await response.clone().json();const h=reply.session;window.requests.push({action,body:JSON.parse(init.body||'{}'),reply:h?{stage:h.stage,current_content:h.current_content,item_index:h.item_index}:null});}return response;}return Response.json({error:'Offline synthetic fixture'}, {status:503});};
 window.mount=async()=>{if(role==='teacher'){await db.saveOfflineTeacherSession({user:{id:901,role:'teacher'},offlineToken:'synthetic-only',expiresAt:Date.now()+86400000,signedOut:false});await db.saveOfflineTeacherSnapshot(901,{learners:[{id:406,first_name:'Sample',last_name:'Learner'}],assessments:[]});await db.saveOfflineHostSession(code,{code,teacher_id:901,learner_id:406,learner:{id:406,first_name:'Sample',last_name:'Learner'},assessment_period:'BoSY',stage:'letter',current_content:content.letters[9],item_index:9,itemIndex:9,connected:true,ended:false,offline:true,offline_created:true,assessment_content:content,story_choices:content.stories,task1Results:content.letters.slice(0,9).map((c,i)=>({index:i,content:c,isCorrect:true})),task2Results:[],passageMiscues:[],comprehensionResults:[],created_at:new Date().toISOString(),updated_at:new Date().toISOString()});createRoot(document.getElementById('root')).render(<Teacher initialCode={code} initialLearnerId="406" onExit={()=>{}}/>);}else{const host=await db.getOfflineHostSession(code);await saveAssessmentState('learner:'+code,{session:host});localStorage.setItem(LEARNER_RECOVERY_KEY,code);createRoot(document.getElementById('root')).render(<Learner/>);}};
 window.getHost=()=>db.getOfflineHostSession(code);window.getPending=()=>db.getOfflineOutbox();window.ready=true;`;
 fs.writeFileSync(path.join(dir,'entry.jsx'),entry);
 const wp=req('next/dist/compiled/webpack/webpack');wp.init();await new Promise((resolve,reject)=>wp.webpack({mode:'development',devtool:false,target:'web',entry:path.join(dir,'entry.jsx'),output:{path:dir,filename:'bundle.js'},resolve:{modules:[path.join(root,'node_modules')],extensions:['.js','.jsx','.mjs','.json']},module:{rules:[{test:/\.jsx$/,exclude:/node_modules/,use:path.join(dir,'jsx.cjs')},{test:/\.css$/,use:path.join(dir,'css.cjs')}]}},(e,s)=>e?reject(e):s.hasErrors()?reject(Error(s.toString({all:false,errors:true}))):resolve()));
 const server=http.createServer((q,s)=>{if(q.url==='/bundle.js'){s.setHeader('Content-Type','text/javascript');s.end(fs.readFileSync(path.join(dir,'bundle.js')));}else{s.setHeader('Content-Type','text/html');s.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script>window.process={env:{NODE_ENV:"development"}}</script><script src="/bundle.js"></script>');}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const {chromium}=req('playwright');const browser=await chromium.launch({executablePath:process.env.CRL_BROWSER_EXECUTABLE,headless:true,args:['--no-sandbox','--no-zygote','--single-process','--disable-dev-shm-usage','--disable-gpu','--allow-loopback-in-peer-connection','--disable-features=WebRtcHideLocalIpsWithMdns']});
 try{
  const tc=await browser.newContext(),teacher=await tc.newPage(),learner=await tc.newPage(),errors=[];
  await teacher.setViewportSize({width:1280,height:900});await learner.setViewportSize({width:800,height:1000});
  for(const page of [teacher,learner])page.on('pageerror',e=>errors.push(e.message));
  const waitHost=async predicate=>{const deadline=Date.now()+20000;while(Date.now()<deadline){const host=await teacher.evaluate(()=>getHost());if(predicate(host))return host;await teacher.waitForTimeout(40);}throw Error('Offline host did not reach expected state');};
  const base='http://127.0.0.1:'+server.address().port;
  await Promise.all([teacher.goto(base+'/?role=teacher'),learner.goto(base+'/?role=learner')]);
  await Promise.all([teacher.waitForFunction(()=>window.ready),learner.waitForFunction(()=>window.ready)]);
  await teacher.evaluate(()=>mount());await teacher.getByRole('button',{name:'Correct',exact:true}).waitFor();await learner.evaluate(()=>mount());await learner.locator('.letter').waitFor();
  await learner.waitForFunction(()=>!document.body.textContent.includes('Waiting for your teacher'));
  assert.equal(await learner.locator('.letter').textContent(),'T');
  await teacher.getByRole('button',{name:'Correct',exact:true}).click();
  await learner.waitForFunction(()=>document.querySelector('.word')?.textContent==='clap');
  await learner.waitForFunction(()=>!document.body.textContent.includes('Moving to the Next Level'));
  assert.equal((await teacher.evaluate(()=>getHost())).item_index,0);
  // Stay at the boundary beyond the 15s interruption deadline. A real nonce
  // round trip, not a cached connected flag, must keep both overlays absent.
  await learner.waitForTimeout(18000);
  assert.equal(await learner.getByRole('dialog',{name:'Waiting for your teacher'}).count(),0);
  assert.equal(await teacher.getByRole('dialog',{name:/Reconnect/}).count(),0);
  for(let i=0;i<10;i++){
    const words=await learner.evaluate(()=>content.words);
    await learner.waitForFunction(expected=>document.querySelector('.word')?.textContent===expected,words[i]);
    const host=await waitHost(host=>host.stage==='word'&&host.item_index===i);assert.equal(host.stage,'word');assert.equal(host.item_index,i);console.log('PASS offline browser Word',i+1);
    await teacher.getByRole('button',{name:'Correct',exact:true}).click();
  }
  console.log('PASS all words reached learner; preparing passage');
  await teacher.getByRole('button',{name:'Start Passage',exact:true}).first().waitFor();
  await teacher.getByRole('button',{name:'Start Passage',exact:true}).first().click();
  await learner.locator('.passage').waitFor({state:'attached'});await teacher.getByRole('button',{name:'Start Reading',exact:true}).click();
  await waitHost(host=>Boolean(host.passage_started_at));
  await teacher.waitForTimeout(1100);await teacher.getByRole('button',{name:'Finish Reading',exact:true}).click();
  await teacher.getByRole('button',{name:'Confirm Finish',exact:true}).click();
  await teacher.getByRole('button',{name:'Confirm & Continue',exact:true}).click();
  await waitHost(host=>host.stage==='comprehension');console.log('PASS timed offline passage reached comprehension');
  for(let i=0;i<6;i++){
    const host=await waitHost(host=>host.stage==='comprehension'&&host.comprehensionResults.length===i);await learner.waitForFunction(question=>document.querySelector('.question')?.textContent===question,host.current_content);console.log('PASS offline browser Question',i+1);
    await teacher.getByRole('button',{name:'Correct',exact:true}).click();
  }
  await teacher.getByRole('button',{name:/5 out of 5$/}).click();
  await waitHost(host=>host.stage==='teacher_review');
  await learner.locator('input[placeholder="ABC123"]').waitFor();
  const saved=await teacher.evaluate(()=>getHost());assert.equal(saved.task1Results.length,10);assert.equal(saved.task2Results.length,10);assert.equal(saved.comprehensionResults.length,6);assert.equal(saved.experience_rating,5);
  assert.ok((await teacher.evaluate(()=>getPending())).length>0);assert.deepEqual(errors,[]);
  assert.deepEqual(await learner.evaluate(()=>window.errors),[]);
  console.log('PASS real offline teacher/learner UI: last letter -> every word -> story -> timed passage -> six questions -> rating -> learner code entry; durable results/outbox retained; presence remains live beyond timeout with cloud unavailable');
 }finally{await browser.close();server.close();fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1});
