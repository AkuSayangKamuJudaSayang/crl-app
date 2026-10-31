/* Optional real UI/WebCrypto/IndexedDB QA. All records and credentials are synthetic. */
const fs=require('fs'),path=require('path'),os=require('os'),http=require('http'),vm=require('vm'),assert=require('assert/strict');
const req=require('module').createRequire(path.join(process.cwd(),'package.json'));
(async()=>{
 const root=process.cwd(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'crl-delete-')),swc=req('next/dist/build/swc');
 const compile=async(file,deps,globals={})=>{const r=await swc.transform(fs.readFileSync(file,'utf8'),{filename:file,jsc:{parser:{syntax:'ecmascript'}},module:{type:'commonjs'}});const c={module:{exports:{}},Buffer,require:n=>n in deps?deps[n]:req(n),...globals};c.exports=c.module.exports;vm.runInNewContext(r.code,c);return c.module.exports;};
 const crypto=require('node:crypto'),bcrypt=req('bcryptjs'),protocol=await import('../lib/deletionStatement.mjs');
 const env={env:{JWT_SECRET:'synthetic-browser-deletion-key'}};
 const login=await compile('lib/loginSecurity.js',{}, {process:env});
 const auth=await compile('lib/deletionAuthorization.js',{'./loginSecurity':login,'./deletionStatement.mjs':protocol},{process:env});
 const password='Synthetic-Only-Password!';let account={id:901,username:'synthetic',role:'teacher',passwordHash:await bcrypt.hash(password,4),failedLoginAttempts:0};
 const db={$queryRaw:async()=>[],user:{findUnique:async()=>({...account}),update:async({data})=>(Object.assign(account,data),{...account})},$transaction:async fn=>fn(db)};
 const learners=[{id:406,lrn:'000000000001',first_name:'SYNTHETIC',last_name:'FIRST'},{id:407,lrn:'000000000002',first_name:'SYNTHETIC',last_name:'SECOND'}];
 fs.writeFileSync(path.join(dir,'jsx.cjs'),`const swc=require(${JSON.stringify(req.resolve('next/dist/build/swc'))});module.exports=function(source){const done=this.async();swc.transform(source,{filename:this.resourcePath,jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'automatic'}}}}).then(r=>done(null,r.code),done);};`);
 fs.writeFileSync(path.join(dir,'css.cjs'),`module.exports=function(source){const names=[...source.matchAll(/\\.([A-Za-z][\\w-]*)/g)].map(m=>m[1]),prefix='qa_'+require('path').basename(this.resourcePath).replace(/\\W/g,'')+'_',map=Object.fromEntries(names.map(n=>[n,prefix+n]));source=source.replace(/:global\\(([^)]+)\\)/g,'$1').replace(/\\.([A-Za-z][\\w-]*)/g,(m,n)=>'.'+map[n]);return 'const style=document.createElement("style");style.textContent='+JSON.stringify(source)+';document.head.append(style);export default '+JSON.stringify(map);};`);
 const entry=`import React from 'react';import{createRoot}from'react-dom/client';import Delete from ${JSON.stringify(root+'/components/DeleteLearnersDialog.jsx')};import Classes from ${JSON.stringify(root+'/components/ClassWorkspace.jsx')};import Pending from ${JSON.stringify(root+'/components/PendingDeletionPasswordDialog.jsx')};import*as db from ${JSON.stringify(root+'/lib/teacherOfflineDb.js')};
 const user={id:901,username:'synthetic',role:'teacher'},learners=${JSON.stringify(learners)},year='11111111-1111-4111-8111-111111111111',section='22222222-2222-4222-8222-222222222222';
 let offline=false;Object.defineProperty(navigator,'onLine',{get:()=>!offline});window.setOffline=value=>{offline=value;};window.completed=[];window.syncRetries=0;window.addEventListener('crl-offline-sync-retry',()=>window.syncRetries++);
 function Harness(){const[view,setView]=React.useState('');const selected=view==='bulk'?learners:[learners[0]];const action=view==='bulk'?'delete_learners':'delete_learner';const catalog={schoolYears:[{id:year,teacherId:901,startYear:2026,label:'2026-2027'}],sections:view==='empty-year'?[]:[{id:section,teacherId:901,schoolYearId:year,name:'SYNTHETIC',_count:{learners:view==='empty-section'?0:2}}],archives:[]};
  const api=async(action,{body})=>{const r=await fetch('/test-class',{method:'POST',body:JSON.stringify({action,body})}),data=await r.json();if(!r.ok)throw Error(data.error);window.completed.push({action,body});return catalog;};
  return <><nav>{['single','bulk','year','section','empty-year','empty-section','pending'].map(value=><button key={value} onClick={()=>setView(value)}>{value}</button>)}</nav>{['single','bulk'].includes(view)?<Delete key={view} user={user} learners={selected} action={action} onCancel={()=>setView('')} onConfirm={async body=>{const full={...body,...(action==='delete_learners'?{learner_ids:selected.map(r=>r.id)}:{learner_id:selected[0].id})};const r=await fetch('/test-delete',{method:'POST',body:JSON.stringify({action,body:full})}),data=await r.json();if(!r.ok)throw Error(data.error);window.completed.push({action,body:full});setView('');return true;}}/>:['year','section','empty-year','empty-section'].includes(view)?<Classes key={view} catalog={catalog} loaded choosing mode='records' selectedYearId={view.includes('section')?year:''} selectedSectionId='' onCatalog={()=>{}} onChoose={()=>{}} onYearChoose={()=>{}} api={api}/>:view==='pending'?<Pending onClose={()=>setView('')}/>:null}</>;
 }
 window.mount=async()=>{await db.saveOfflineTeacherSession({user,offlineToken:'synthetic-only',expiresAt:Date.now()+86400000,signedOut:false});createRoot(document.getElementById('root')).render(<Harness/>);window.ready=true;};
 window.seedPending=async()=>{await db.saveOfflineTeacherSnapshot(901,{learners:[],learnerTombstones:learners,assessments:[]});await db.enqueueOfflineMutation({userId:901,kind:'delete_learner',url:'/api/assessment?action=delete_learner',body:{learner_id:406,confirmation:'OLD PHRASE',deletion_reason:'Synthetic legacy removal'},syncLabel:{title:'Learner removal',details:['SYNTHETIC FIRST']}});return(await db.getOfflineOutbox())[0];};window.readPending=()=>db.getOfflineOutbox();window.patchPending=(entries)=>db.updatePendingDeletionProofs(901,entries);window.acknowledge=id=>db.removeOfflineMutation(id);window.rejectPassword=()=>db.enqueueOfflineMutation({userId:901,kind:'delete_learner',body:{confirmation_password:'SYNTHETIC'}});window.mount();`;
 fs.writeFileSync(path.join(dir,'entry.jsx'),entry);const wp=req('next/dist/compiled/webpack/webpack');wp.init();await new Promise((resolve,reject)=>wp.webpack({mode:'development',devtool:false,target:'web',entry:path.join(dir,'entry.jsx'),output:{path:dir,filename:'bundle.js'},resolve:{modules:[path.join(root,'node_modules')],extensions:['.js','.jsx','.mjs','.json']},module:{rules:[{test:/\.jsx$/,exclude:/node_modules/,use:path.join(dir,'jsx.cjs')},{test:/\.css$/,use:path.join(dir,'css.cjs')}]}},(e,s)=>e?reject(e):s.hasErrors()?reject(Error(s.toString({all:false,errors:true}))):resolve()));
 let validDeletes=0;
 const server=http.createServer(async(q,s)=>{
  const reply=(body,status=200)=>{s.statusCode=status;s.setHeader('Content-Type','application/json');s.end(JSON.stringify(body));};
  try{
   if(q.url==='/bundle.js'){s.setHeader('Content-Type','text/javascript');return s.end(fs.readFileSync(path.join(dir,'bundle.js')));}
   if(q.method==='POST'){
    let text='';for await(const chunk of q)text+=chunk;const data=JSON.parse(text);
    if(q.url==='/api/auth/deletion-confirmation'){const u=await auth.requireDeletionPassword(db,901,data.password);return reply({certificate:auth.createDeletionCertificate(u,data.publicKey),userId:901,targets:learners.filter(row=>(data.learner_ids||[]).includes(row.id)).map(({id,lrn})=>({id,lrn}))});}
    if(q.url==='/test-delete'){const ids=data.action==='delete_learners'?data.body.learner_ids:[data.body.learner_id];await auth.verifyDeletionAuthorization(db,901,data.action,data.body,learners.filter(row=>ids.includes(row.id)));validDeletes++;return reply({ok:true});}
    if(q.url==='/test-class'){if(!data.body.empty_confirmation)await auth.requireDeletionPassword(db,901,data.body.confirmation_password);return reply({ok:true});}
   }
   s.setHeader('Content-Type','text/html');s.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html{font-family:Arial;background:var(--crl-bg,#fff);color:var(--crl-text,#203247)}html[data-crl-theme=dark]{--crl-bg:#101820;--crl-surface:#18232e;--crl-surface-2:#243341;--crl-text:#edf2f6;--crl-muted:#b6c5cf;--crl-line:#526777}button{min-height:44px}</style><div id="root"></div><script>window.process={env:{NODE_ENV:"development"}}</script><script src="/bundle.js"></script>');
  }catch(error){reply({error:error.message,...error.payload},error.status||500);}
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const {chromium}=req('playwright'),browser=await chromium.launch({executablePath:process.env.CRL_BROWSER_EXECUTABLE,headless:true,args:['--no-sandbox','--no-zygote','--single-process','--disable-dev-shm-usage','--disable-gpu']});
 try{
  const context=await browser.newContext(),page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.ready);
  for(const theme of ['light','dark'])for(const width of [320,390,800,1440]){
   await page.setViewportSize({width,height:1000});await page.evaluate(t=>document.documentElement.dataset.crlTheme=t,theme);
   await page.getByRole('button',{name:'single',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Delete learner',exact:true});await dialog.waitFor();
   assert.equal(await dialog.locator('input[type=password]').count(),1);assert.equal(await dialog.getByText(/Type .*to confirm/).count(),0);
   assert.equal(await dialog.getByRole('button',{name:'Delete',exact:true}).isDisabled(),true);
   const box=await dialog.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width&&box.height<=1000);
   await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  }
  for(const mode of ['online','offline'])for(const action of ['single','bulk']){
   await page.evaluate(mode=>setOffline(mode==='offline'),mode);await page.getByRole('button',{name:action,exact:true}).click();const dialog=page.getByRole('dialog',{name:action==='single'?'Delete learner':'Delete selected learners',exact:true});
   await dialog.locator('textarea').fill('Synthetic duplicate enrollment');await dialog.getByLabel('Account password').fill('wrong');await dialog.getByRole('button',{name:'Delete',exact:true}).click();await dialog.getByRole('alert').waitFor();
   assert.equal(await dialog.getByLabel('Account password').inputValue(),'');
   await dialog.getByLabel('Account password').fill(password);await dialog.getByRole('button',{name:'Delete',exact:true}).click();await dialog.waitFor({state:'detached'}).catch(async error=>{console.log('Remaining dialog',await page.getByRole('dialog').allTextContents());throw error;});
  }
  assert.equal(validDeletes,4);console.log('PASS online/offline learner confirmations');
  await page.evaluate(()=>setOffline(false));
  for(const kind of ['year','section','empty-year','empty-section']){
   await page.getByRole('button',{name:kind,exact:true}).click();await page.getByRole('button',{name:/Options for/}).click();await page.getByRole('menuitem',{name:'Delete',exact:true}).click();const dialog=page.getByRole('dialog');
   const empty=kind.startsWith('empty');assert.equal(await dialog.locator('input[type=password]').count(),empty?0:1);
   if(!empty){await dialog.getByRole('checkbox').check();await dialog.getByLabel('Reason for deletion').fill('Synthetic class cleanup');await dialog.getByLabel('Account password').fill('wrong');await dialog.getByRole('button',{name:'Archive and delete',exact:true}).click();await dialog.getByRole('alert').waitFor();assert.equal(await dialog.getByLabel('Account password').inputValue(),'');await dialog.getByLabel('Account password').fill(password);}
   await dialog.getByRole('button',{name:empty?'Delete':'Archive and delete',exact:true}).click();await dialog.waitFor({state:'detached'});
  }
  console.log('PASS year/section and empty confirmations');
  const seeded=await page.evaluate(()=>seedPending());await page.getByRole('button',{name:'pending',exact:true}).click();const pending=page.getByRole('dialog',{name:'Confirm pending deletions',exact:true});await pending.waitFor();await pending.getByLabel('Account password').fill(password);await pending.getByRole('button',{name:'Confirm and sync',exact:true}).click();await pending.waitFor({state:'detached'});
  const queue=await page.evaluate(()=>readPending());assert.equal(queue.length,1);assert.equal(queue[0].id,seeded.id);assert.equal(queue[0].sequence,seeded.sequence);assert.equal(queue[0].body.confirmation,undefined);assert.equal(JSON.stringify(queue).includes(password),false);await auth.verifyDeletionAuthorization(db,901,'delete_learner',queue[0].body,[learners[0]]);assert.equal(await page.evaluate(()=>window.syncRetries),1);
  await assert.rejects(()=>page.evaluate(()=>rejectPassword()),/cannot be stored/);await page.evaluate(id=>acknowledge(id),seeded.id);const raced=await page.evaluate(entries=>patchPending(entries),queue);assert.equal(raced.updated,0);assert.equal((await page.evaluate(()=>readPending())).length,0);
  assert.deepEqual(errors,[]);console.log('PASS real deletion UI: password fields/geometry in two themes at 320/390/800/1440; online/offline single/bulk password checks; nonempty year/section validation and empty confirmation; legacy pending reauthorization preserves real IndexedDB sequence without passwords; queue rejects plaintext and acknowledged work is never resurrected');
 }finally{await browser.close();server.close();fs.rmSync(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
