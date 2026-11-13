const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
(async()=>{
 const source=fs.readFileSync('app/learner/LearnerAssessmentPage.jsx','utf8');
 const toolbar=source.slice(source.indexOf('function LearnerToolbar('),source.indexOf('\nfunction LearnerDialogs(')).replace('<style jsx global>', '<style>');
 const swc=require('next/dist/build/swc');
 const compile=async text=>(await swc.transform(text,{filename:'toolbar.jsx',jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'automatic'}}},module:{type:'commonjs'}})).code;
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
 for(const userAgent of [
  'Mozilla/5.0 (Linux; Android 12; BAH4-W09) AppleWebKit/537.36 Chrome/114.0.0.0 Mobile Safari/537.36 HuaweiBrowser/14.0.0',
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (HarmonyOS; Tablet)',
  'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36',
 ]){
  const ctx={module:{exports:{}},require,navigator:{userAgent,standalone:false},window:{matchMedia:()=>({matches:false})},document:{referrer:''}};
  ctx.exports=ctx.module.exports;
  vm.runInNewContext(await compile(toolbar+'\nmodule.exports= LearnerToolbar;'),ctx);
  const html=renderToStaticMarkup(React.createElement(ctx.module.exports,{onOpenConnection(){},onOpenExit(){}}));
  assert.match(html,/Offline Mode Settings/);assert.match(html,/Exit App/);assert.doesNotMatch(html,/Install CRL-App Learner/);
 }
 // Device detection must never gate local fallback; existing linked-session checks remain.
 assert.doesNotMatch(source,/isInstalledApp|useIsInstalledApp|Open the installed learner app/);
 assert.match(source,/findLinkedAssessmentPeerSession\("learner"\)/);
 assert.doesNotMatch(fs.readFileSync('app/learner/LearnerPwaShell.jsx','utf8'),/LearnerInstallButton/);
 const retired=fs.readFileSync('app/learner/LearnerInstallButton.jsx','utf8');
 assert.match(retired,/return null/);assert.doesNotMatch(retired,/createPortal|MutationObserver|AppInstallButton/);
 const install=fs.readFileSync('app/install/[app]/page.jsx','utf8');assert.match(install,/<AppInstallButton app=\{app\}/);
 assert.equal(JSON.parse(fs.readFileSync('public/learner-manifest.webmanifest')).id,'/learner');
 console.log('PASS actual learner toolbar renders offline settings and exit for Huawei, HarmonyOS, generic tablet/desktop UAs without standalone APIs; assessment install mount retired; dedicated installation and learner identity retained');
})().catch(e=>{console.error(e);process.exit(1)});
