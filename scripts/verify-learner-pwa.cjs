const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
(async()=>{
  const swc=require('next/dist/build/swc');
  async function module(file,globals){const ctx={module:{exports:{}},...globals};ctx.exports=ctx.module.exports;vm.runInNewContext((await swc.transform(fs.readFileSync(file,'utf8'),{filename:file,jsc:{parser:{syntax:'ecmascript'}},module:{type:'commonjs'}})).code,ctx);return ctx.module.exports;}
  const win=new EventTarget(),registration=new EventTarget(),worker=new EventTarget();let calls=0,updates=0;
  worker.state='installing';worker.postMessage=()=>calls++;registration.installing=worker;registration.active=null;registration.update=()=>{updates++;return new Promise(()=>{});};
  const {watchLearnerWorker}=await module('lib/learnerWorker.js',{window:win});const stop=watchLearnerWorker(registration);assert.equal(updates,1);assert.equal(calls,0);
  worker.state='activated';registration.active=worker;worker.dispatchEvent(new Event('statechange'));assert.equal(calls,1,'Learner warms without waiting for registration.update or root serviceWorker.ready');win.dispatchEvent(new Event('online'));assert.equal(calls,2);stop();win.dispatchEvent(new Event('online'));worker.dispatchEvent(new Event('statechange'));assert.equal(calls,2);
  console.log('PASS exact learner registration activation, hanging update independence, online warming and cleanup');

  const stores=new Map(),listeners=new Map(),origin='https://crl.test',resources=new Map(),fetched=[];let offline=false,opens=0,claimed=0;
  const normalize=input=>new URL(typeof input==='string'?input:input.url,origin).href;
  const caches={async keys(){return [...stores.keys()];},async open(name){opens++;if(!stores.has(name))stores.set(name,new Map());const rows=stores.get(name);return{async match(input){return rows.get(normalize(input))?.clone();},async put(input,response){rows.set(normalize(input),response.clone());},async keys(){return [...rows.keys()].map(url=>new Request(url));}};},async delete(name){return stores.delete(name);}};
  const ctx=vm.createContext({caches,URL,Response,AbortController,setTimeout,clearTimeout,fetch:async input=>{const key=normalize(input);fetched.push(key);if(offline||!resources.has(key))throw Error('Synthetic network unavailable');return resources.get(key).clone();},self:{location:{origin},addEventListener:(type,fn)=>listeners.set(type,fn),skipWaiting:()=>{},clients:{claim:async()=>{claimed++;}}}});
  vm.runInContext(fs.readFileSync('public/learner-pwa-sw.js','utf8'),ctx);const run=s=>vm.runInContext(s,ctx);
  async function dispatch(type,request,data){const pending=[];let response;listeners.get(type)({request,data,waitUntil:p=>pending.push(p),respondWith:p=>response=p});const value=response?await response:undefined;await Promise.all(pending);return value;}
  await dispatch('install');assert.equal(opens,0);assert.equal(fetched.length,0);
  const previous=await caches.open('crl-app-learner-offline-v31');await previous.put('/learner',new Response('working learner'));await previous.put('/_next/static/old.js',new Response('old working chunk'));await caches.open('crla-pwa-teacher-test');
  await dispatch('activate');assert.equal(claimed,1);assert.ok(stores.has('crl-app-learner-offline-v31'));
  offline=true;const oldDoc=await dispatch('fetch',{method:'GET',url:origin+'/learner?code=FAKE22',mode:'navigate'});assert.equal(await oldDoc.text(),'working learner');const count=fetched.length;
  const chunk=await dispatch('fetch',{method:'GET',url:origin+'/_next/static/old.js',mode:'cors',referrer:origin+'/learner'});assert.equal(await chunk.text(),'old working chunk');assert.equal(fetched.length,count,'Cached learner chunks must not wait on the network');
  assert.equal(await dispatch('fetch',{method:'GET',url:origin+'/api/assessment',mode:'cors',referrer:origin+'/learner'}),undefined,'Assessment API must remain outside the worker cache');
  offline=false;resources.set(origin+'/learner',new Response('<script src="/_next/static/new.js"></script>'));
  await dispatch('message',null,{type:'WARM_LEARNER_SHELL'});assert.ok(stores.has('crl-app-learner-offline-v31'));assert.equal(await(await previous.match('/learner')).text(),'working learner');
  resources.set(origin+'/_next/static/new.js',new Response('new chunk'));for(const path of run('ICON_URLS'))resources.set(origin+path,new Response('asset'));
  const before=fetched.length;await Promise.all([dispatch('message',null,{type:'WARM_LEARNER_SHELL'}),dispatch('message',null,{type:'WARM_LEARNER_SHELL'})]);assert.equal(fetched.slice(before).filter(url=>url===origin+'/learner').length,1);
  assert.ok(!stores.has('crl-app-learner-offline-v31'));assert.ok(stores.has('crla-pwa-teacher-test'));const current=await caches.open(run('CACHE_NAME'));assert.equal(await(await current.match('/_next/static/old.js')).text(),'old working chunk');assert.equal(await(await current.match('/learner')).text(),'<script src="/_next/static/new.js"></script>');
  console.log('PASS learner install/activate independent of cache/network, old offline upgrade retention, cached chunks immediately available, API isolation and coalesced complete-shell replacement');

  let manifest=JSON.parse(fs.readFileSync('public/learner-manifest.webmanifest')),bad=false,hang=false;const timers=new Map();let sequence=0;
  const globals={window:{location:{origin}},navigator:{serviceWorker:{getRegistration:async()=>({active:{state:'activated',scriptURL:origin+'/learner-pwa-sw.js'}})}},URL,Uint8Array,DataView,AbortController,setTimeout:(fn,ms)=>{const id=++sequence;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),fetch:async(input,options)=>{assert.equal(options.credentials,'omit');if(hang)return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(Error('Aborted'))));if(String(input).endsWith('.webmanifest'))return{ok:true,json:async()=>manifest};const bytes=fs.readFileSync('public'+new URL(input,origin).pathname);return{ok:!bad,headers:new Headers({'content-type':bad?'text/html':'image/png'}),arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};}};
  const {checkPwaReadiness}=await module('lib/pwaReadiness.js',globals);assert.deepEqual({...await checkPwaReadiness('learner')},{manifest:true,icons:true,offline:true});assert.equal(timers.size,0);
  bad=true;assert.deepEqual({...await checkPwaReadiness('learner')},{manifest:true,icons:false,offline:true});bad=false;manifest={...manifest,id:'/teacher'};assert.equal((await checkPwaReadiness('learner')).manifest,false);
  hang=true;const pending=checkPwaReadiness('learner');for(const t of [...timers.values()]){assert.ok(t.ms<=8000);t.fn();}assert.equal((await pending).manifest,false);assert.equal(timers.size,0);
  console.log('PASS actual public-file checks: correct manifest identity, icon response/PNG dimensions, no credentials, honest worker status and bounded/retryable failed checks');
})().catch(e=>{console.error(e);process.exitCode=1});
