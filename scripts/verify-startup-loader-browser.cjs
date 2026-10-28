/* Optional: CRL_BROWSER_EXECUTABLE=/path/to/chromium node scripts/verify-startup-loader-browser.cjs
 * Playwright is supplied by the test environment, not a production dependency.
 * The actual startup/recovery and loader components use controlled synthetic IO.
 */
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');

(async () => {
  const { chromium } = require(process.env.CRL_PLAYWRIGHT_MODULE || 'playwright');
  const swc = require('next/dist/build/swc'), webpackModule = require('next/dist/compiled/webpack/webpack'); webpackModule.init();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crl-startup-'));
  const transform = async (text, filename) => (await swc.transform(text, { filename, jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } } }, module: { type: 'commonjs' } })).code;
  fs.writeFileSync(path.join(dir, 'loader.js'), await transform(fs.readFileSync('app/components/AppLoadingScreen.jsx', 'utf8'), 'Loader.jsx'));
  let recovery = fs.readFileSync('components/TeacherAssessmentRecovery.jsx', 'utf8');
  recovery = recovery.replace('"next/navigation"', '"./mocks"').replace('"../app/teacher/assessment/AssessmentClient"', '"./assessment"').replace('"./AssessmentRecoveryDialog"', '"./dialog"').replace('"../app/components/AppLoadingScreen"', '"./loader"');
  for (const file of ['assessmentRecovery.mjs', 'teacherOfflineDb', 'assessmentOutbox']) recovery = recovery.replace('"../lib/'+file+'"', '"./mocks"');
  fs.writeFileSync(path.join(dir, 'recovery.js'), await transform(recovery, 'Recovery.jsx'));
  fs.writeFileSync(path.join(dir, 'dialog.js'), 'const React=require('+JSON.stringify(require.resolve('react'))+');module.exports=({title,children})=>React.createElement("div",{role:"dialog"},title,children);');
  fs.writeFileSync(path.join(dir, 'assessment.js'), 'module.exports=()=>null;');
  fs.writeFileSync(path.join(dir, 'mocks.js'), `
    exports.useRouter=()=>({replace:()=>{}});exports.usePathname=()=>'/teacher';
    exports.getOfflineTeacherSession=()=>window.gates.local.promise;
    exports.activateRecoveryOwner=()=>{};exports.readTeacherRecovery=()=>window.noDraft?null:{session:window.savedSession};
    exports.getOfflineHostSession=()=>window.gates.host.promise;
    exports.getAssessmentState=async()=>({});exports.getOfflineTeacherSnapshot=async()=>({});
    exports.recoveryEligible=()=>true;exports.resolveTeacherRecovery=()=>{};exports.mergeRecoverySession=(a,b)=>({...a,...b});
  `);
  const entry = `
    import React from ${JSON.stringify(require.resolve('react'))};
    import {createRoot} from ${JSON.stringify(require.resolve('react-dom/client'))};import Recovery from './recovery';
    const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}};
    window.savedSession={code:'TST234',teacher_id:901,learner_id:406,stage:'passage'};
    window.gates={local:defer(),auth:defer(),host:defer(),cloud:defer()};
    window.fetch=url=>url.startsWith('/api/auth')?window.gates.auth.promise:window.gates.cloud.promise;
    const user={id:901,role:'teacher'},cached={user,offlineToken:'synthetic',expiresAt:Date.now()+60000};
    window.releaseStartup=(name,fail=false)=>{
      const data=name==='local'?cached:name==='auth'?{valid:true,user}:name==='host'?window.savedSession:{session:window.savedSession};
      if(fail)window.gates[name].reject(Error('offline'));
      else window.gates[name].resolve(name==='auth'||name==='cloud'?{ok:true,status:200,json:async()=>data}:data);
    };
    const root=createRoot(document.getElementById('root'));root.render(<Recovery><main id="ready-workspace">Workspace ready</main></Recovery>);window.fixtureUnmount=()=>root.unmount();
  `;
  fs.writeFileSync(path.join(dir, 'entry.js'), await transform(entry, 'Fixture.jsx'));
  await new Promise((resolve, reject) => webpackModule.webpack({ mode:'development',target:'web',devtool:false,entry:path.join(dir,'entry.js'),output:{path:dir,filename:'bundle.js'},resolve:{modules:[path.resolve('node_modules')]} }, (error,stats)=>error?reject(error):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()));
  const bundle=fs.readFileSync(path.join(dir,'bundle.js'),'utf8'),logo=fs.readFileSync('public/crl-app-logo.png');
  const browser=await chromium.launch({executablePath:process.env.CRL_BROWSER_EXECUTABLE,headless:true,args:JSON.parse(process.env.CRL_BROWSER_ARGS||'["--no-sandbox","--no-zygote","--single-process","--disable-dev-shm-usage","--disable-gpu"]')});
  try {
    const page=await browser.newPage({viewport:{width:320,height:800},isMobile:true,hasTouch:true});
    await page.route('https://crl.test/**',route=>route.fulfill(new URL(route.request().url()).pathname==='/crl-app-logo.png'?{contentType:'image/png',body:logo}:{contentType:'text/html',body:'<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0"><div id="root"></div></body></html>'}));
    for(const width of [320,390,800,1280,1440])for(const theme of ['light','dark']){
      await page.goto('https://crl.test/');await page.setViewportSize({width,height:800});
      const errors=[],onError=e=>errors.push(e.message);page.on('pageerror',onError);
      await page.evaluate(theme=>{localStorage.setItem('crla_theme',theme);document.documentElement.setAttribute('data-crl-theme',theme);},theme);
      await page.addScriptTag({content:bundle});
      const progress=page.getByRole('progressbar',{name:'Startup checks'});
      await progress.waitFor();assert.equal(await progress.getAttribute('aria-valuenow'),'0');
      await page.locator('.crlAppLoaderLogo').evaluate(img=>img.decode());
      assert.equal(await page.locator('.crlAppLoaderLogo').evaluate(img=>img.naturalWidth),1883);
      const bounds=await page.locator('.crlAppLoaderContent').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width+1);assert.ok(bounds.y>=0&&bounds.y+bounds.height<=800);
      assert.equal(await page.locator('.crlAppLoader').count(),1);
      for(const [name,count]of [['local','1'],['auth','2'],['host','3']]){
        await page.evaluate(name=>window.releaseStartup(name),name);await page.waitForFunction(count=>document.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow')===count,count);
        await page.waitForTimeout(80);assert.equal(await progress.getAttribute('aria-valuenow'),count);
      }
      if(width===390&&theme==='light'&&process.env.CRL_QA_SCREENSHOT)await page.screenshot({path:process.env.CRL_QA_SCREENSHOT});
      await page.emulateMedia({reducedMotion:'reduce'});
      assert.equal(await page.locator('.crlAppLoaderActivity').evaluate(node=>getComputedStyle(node).animationName),'none');
      await page.emulateMedia({reducedMotion:'no-preference'});
      const ready=Date.now();await page.evaluate(()=>window.releaseStartup('cloud'));
      await page.getByRole('dialog').waitFor({timeout:1500});assert.equal(await progress.count(),0);assert.ok(Date.now()-ready<1500);
      assert.deepEqual(errors,[]);page.off('pageerror',onError);await page.evaluate(()=>window.fixtureUnmount());
      console.log('PASS actual startup browser pending storage/auth/cloud phases, logo and immediate recovery handoff',width,theme);
    }
    // Fast/no-draft and failed-network/valid-local-draft paths use the same gate.
    for(const scenario of ['fast','offline']){
      await page.goto('https://crl.test/');await page.addScriptTag({content:bundle});
      await page.evaluate(scenario=>{window.noDraft=scenario==='fast';window.releaseStartup('local');window.releaseStartup('auth',scenario==='offline');window.releaseStartup('host');window.releaseStartup('cloud',scenario==='offline');},scenario);
      await page.locator(scenario==='fast'?'#ready-workspace':'[role=dialog]').waitFor({timeout:1500});
      assert.equal(await page.locator('[role=progressbar]').count(),0);await page.evaluate(()=>window.fixtureUnmount());
      console.log('PASS startup browser',scenario,'handoff without a minimum display timer');
    }
  } finally {await browser.close();fs.rmSync(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
