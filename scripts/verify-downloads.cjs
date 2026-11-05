const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
(async()=>{
 const swc=require('next/dist/build/swc');
 const compile=async file=>(await swc.transform(fs.readFileSync(file,'utf8'),{filename:file,jsc:{parser:{syntax:'ecmascript'}},module:{type:'commonjs'}})).code;
 const win=new EventTarget(),timers=new Map();let next=0,gesture=false,manifest='/teacher-manifest.webmanifest';
 win.location={href:'https://crl.test/install/teacher',pathname:'/install/teacher'};win.navigator={standalone:false};win.matchMedia=()=>({matches:false});
 win.setTimeout=(fn,delay)=>{const id=++next;timers.set(id,{fn,delay});return id;};win.clearTimeout=id=>timers.delete(id);
 const ctx={module:{exports:{}},window:win,document:{querySelector:()=>({href:manifest}),querySelectorAll:()=>[{href:manifest}]},URL,Event,Promise,WeakSet};ctx.exports=ctx.module.exports;
 vm.runInNewContext(await compile('lib/pwaInstall.js'),ctx);const api=ctx.module.exports;
 const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
 const emit=(choice='dismissed',throws=false)=>{let calls=0;const response=defer(),e=new Event('beforeinstallprompt',{cancelable:true});e.prompt=()=>{assert.ok(gesture,'prompt must run in the initiating click');calls++;if(throws)throw Error('Synthetic prompt failure');return Promise.resolve();};e.userChoice=response.promise;win.dispatchEvent(e);return{e,response,calls:()=>calls,choose:()=>response.resolve({outcome:choice})};};
 const request=app=>{gesture=true;try{return api.requestPwaInstall(app);}finally{gesture=false;}};
 let notified=0;const unsubscribe=api.subscribePwaInstallPrompt(()=>notified++,'teacher');
 const first=emit();assert.equal(api.getPwaInstallPrompt('teacher'),first.e);const attempt=request('teacher');assert.equal(first.calls(),1);assert.equal(api.getPwaInstallPrompt('teacher'),null);assert.equal(request('teacher'),attempt);first.choose();assert.equal(await attempt,'dismissed');assert.equal(await request('teacher'),'unavailable');assert.equal(first.calls(),1);
 win.dispatchEvent(first.e);assert.equal(await request('teacher'),'unavailable');
 const bad=emit('dismissed',true);assert.equal(await request('teacher'),'failed');assert.equal(bad.calls(),1);assert.equal(await request('teacher'),'unavailable');
 const old=emit(),oldRun=request('teacher'),fresh=emit('accepted');old.choose();await oldRun;assert.equal(api.getPwaInstallPrompt('teacher'),fresh.e);const freshRun=request('teacher');fresh.choose();assert.equal(await freshRun,'accepted');assert.equal(fresh.calls(),1);
 win.dispatchEvent(new Event('appinstalled'));assert.equal(api.isStandalonePwa(),false);const reinstalled=emit('accepted'),again=request('teacher');reinstalled.choose();assert.equal(await again,'accepted');assert.equal(reinstalled.calls(),1);
 const wrong=emit();manifest='/learner-manifest.webmanifest';win.location.pathname='/learner';assert.equal(await request('learner'),'unavailable');assert.equal(wrong.calls(),0);assert.equal(api.getPwaInstallPrompt('teacher'),null);
 const learner=emit('accepted'),learnerRun=request('learner');win.dispatchEvent(new Event('appinstalled'));assert.equal(await learnerRun,'accepted');assert.equal(learner.calls(),1);assert.equal(api.isStandalonePwa(),false);
 const stuck=emit(),stuckRun=request('learner');assert.equal(stuck.calls(),1);assert.equal(timers.size,1);for(const t of [...timers.values()]){assert.ok(t.delay<=45000);t.fn();}assert.equal(await stuckRun,'pending');assert.equal(timers.size,0);const recovered=emit(),retry=request('learner');recovered.choose();assert.equal(await retry,'dismissed');
 win.navigator.standalone=true;assert.equal(await request('learner'),'standalone');win.navigator.standalone=false;
 const ios=api.installationHelp('learner',{userAgent:'Mozilla Macintosh',maxTouchPoints:5});assert.ok(ios.steps.some(t=>t.includes('Share')));assert.ok(ios.steps.some(t=>t.includes('Add to Home Screen')));assert.ok(api.installationHelp('teacher',{userAgent:'Android wv'}).embedded);assert.ok(api.installationHelp('teacher',{userAgent:'Android'}).find.includes('apps list'));assert.equal(ios.url,'/install/learner');
 assert.ok(notified>5);unsubscribe();console.log('PASS actual install controller: synchronous user gesture, single consumption, dismissal/rejection/reinstall, newer prompt retention, app identity, bounded hung prompt and platform/icon help');

 const urls=new Map(),downloads=[],fileTimers=[];let attached=false,fail=false;
 const anchor={remove(){attached=false;},click(){assert.ok(attached,'mobile downloads need an attached anchor');if(fail)throw Error('Synthetic click failure');downloads.push({name:this.download,blob:urls.get(this.href)});}};
 const d={module:{exports:{}},Blob,URL:{createObjectURL:blob=>{const key='blob:'+urls.size;urls.set(key,blob);return key;},revokeObjectURL:key=>urls.delete(key)},document:{createElement:()=>anchor,body:{appendChild(){attached=true;}}},setTimeout:(fn,delay)=>fileTimers.push({fn,delay})};d.exports=d.module.exports;vm.runInNewContext(await compile('lib/downloadFile.js'),d);const download=d.module.exports.downloadBlob;
 for(let i=0;i<3;i++)download(new Blob(['synthetic '+i]),'records.csv');assert.equal(downloads.length,3);assert.equal(attached,false);assert.equal(urls.size,3);assert.deepEqual(await Promise.all(downloads.map(row=>row.blob.text())),['synthetic 0','synthetic 1','synthetic 2']);assert.ok(fileTimers.every(t=>t.delay>=60000));
 assert.throws(()=>download(new Blob([]),'empty.csv'),/empty/);assert.equal(urls.size,3);fail=true;assert.throws(()=>download(new Blob(['bad']),'bad.csv'),/click failure/);assert.equal(urls.size,3);assert.equal(attached,false);fail=false;download(new Blob(['retry']),'../backup.crlbackup');assert.ok(!downloads.at(-1).name.includes('/'));assert.equal(await downloads.at(-1).blob.text(),'retry');fileTimers.forEach(t=>t.fn());assert.equal(urls.size,0);
 console.log('PASS actual file handoff: attached anchors, repeated intact payloads, URLs retained for mobile, bounded cleanup, safe filenames and recoverable click/empty-file failures');
 const teacher=JSON.parse(fs.readFileSync('public/teacher-manifest.webmanifest')),student=JSON.parse(fs.readFileSync('public/learner-manifest.webmanifest'));
 assert.equal(teacher.id,'/teacher');assert.equal(student.id,'/learner');assert.notEqual(teacher.id,student.id);
 for(const manifest of [teacher,student]){assert.equal(manifest.display,'standalone');for(const size of [192,512]){const icon=manifest.icons.find(i=>i.sizes===size+'x'+size&&i.purpose!=='maskable');const bytes=fs.readFileSync('public'+icon.src);assert.equal(bytes.readUInt32BE(16),size);assert.equal(bytes.readUInt32BE(20),size);}}
 console.log('PASS distinct stable teacher/learner manifest identities and actual 192/512 PNG icon dimensions');
})().catch(error=>{console.error(error);process.exitCode=1;});
