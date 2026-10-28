/* Actual dashboard JSX/CSS with synthetic records only. --browser is optional. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
(async()=>{
 const source=fs.readFileSync('app/teacher/page.jsx','utf8'),swc=require('next/dist/build/swc');
 const transform=async(text,filename)=>(await swc.transform(text,{filename,jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'automatic'}}},module:{type:'commonjs'}})).code;
 const tabs=source.slice(source.indexOf('const TABS ='),source.indexOf('const PERIODS ='));
 const start=source.indexOf('<div className="bentoGrid">'),end=source.indexOf('\n          </section>\n        )}',start),fragment=source.slice(start,end);
 assert.ok(start>0&&end>start);
 const iconCode=await transform(fs.readFileSync('components/TeacherMenuIcon.jsx','utf8'),'TeacherMenuIcon.jsx');
 const iconContext={module:{exports:{}},require};iconContext.exports=iconContext.module.exports;vm.runInNewContext(iconCode,iconContext);const TeacherMenuIcon=iconContext.module.exports.default;
 const code=await transform(tabs+'export default function View(){return ('+fragment+');}','Menu.jsx');
 const rows=Array.from({length:5},(_,i)=>({learner:{id:i+1,name:i===4?'A Very Long Synthetic Learner Name With Several Parts':'Example Learner '+(i+1),lrn:'PRIVATE-IDENTIFIER'},hasBosy:i>0,hasMosy:i>1,hasEosy:i>2,profile:'PRIVATE-PROFILE'}));
 const base={TeacherMenuIcon,stats:{total:25,bosy:10,mosy:8,eosy:4,gradeReady:4,intervention:6},latestDashboardRows:rows,loadingData:false,formatName:learner=>learner.name,homeExpanded:false,reportsView:null};
 const calls=[];let expanded=false;
 const ctx={module:{exports:{}},require,...base,setHomeExpanded:update=>{expanded=update(expanded);},openBento:id=>calls.push(id)};ctx.exports=ctx.module.exports;vm.runInNewContext(code,ctx);
 const node=ctx.module.exports.default(),html=renderToStaticMarkup(node),all=[];
 function visit(n){if(!n||typeof n!=='object')return;all.push(n);React.Children.forEach(n.props?.children,visit);}visit(node);
 assert.ok(html.includes('Latest Learner Update'));assert.ok(!/Latest Profile|PRIVATE-|Latest Learner Overview|>LRN<|>Sex</.test(html));
 assert.equal(all.filter(n=>n.type==='th').length,2);assert.equal(all.filter(n=>n.type==='tr').length,6);
 assert.equal(all.filter(n=>n.props?.className==='overviewStatus').length,9);assert.equal(all.filter(n=>n.props?.className==='overviewPending').length,1);
 assert.ok(html.includes('>25</div>')); // Full-roster total must not become the five-row preview count.
 const header=all.find(n=>n.props?.className==='bentoHomeHead');header.props.onClick();assert.equal(expanded,true);header.props.onClick();assert.equal(expanded,false);
 const buttons=all.filter(n=>n.props?.className==='bentoTile');assert.equal(buttons.length,6);buttons.forEach(n=>n.props.onClick());assert.deepEqual(calls,['conduct','records','activities','analytics','profile','reports']);
 ctx.latestDashboardRows=[];assert.ok(renderToStaticMarkup(ctx.module.exports.default()).includes('colSpan="2"'));
 const selector=source.slice(source.indexOf('const latestDashboardRows = useMemo('),source.indexOf('  const stats =',source.indexOf('const latestDashboardRows = useMemo(')));
 const sample=Array.from({length:8},(_,i)=>({learner:{id:i+1,created_at:'2026-01-'+String(i+1).padStart(2,'0')}}));
 assert.deepEqual(Array.from(vm.runInNewContext(selector+'latestDashboardRows.map(x=>x.learner.id)',{dashboardRows:sample,useMemo:fn=>fn()})),[8,7,6,5,4]);assert.equal(sample.length,8);
 console.log('PASS actual menu callbacks, two-column completed-only statuses, five-row preview, full totals, empty state and Overview toggle');
 if(!process.argv.includes('--browser'))return;
 const os=require('node:os'),path=require('node:path'),{chromium}=require(process.env.CRL_PLAYWRIGHT_MODULE||'playwright'),webpackModule=require('next/dist/compiled/webpack/webpack');webpackModule.init();
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'crl-main-menu-'));fs.writeFileSync(path.join(dir,'icon.js'),iconCode);
 const entry=`import React,{useState}from ${JSON.stringify(require.resolve('react'))};import{createRoot}from ${JSON.stringify(require.resolve('react-dom/client'))};import TeacherMenuIcon from './icon';${tabs}
 const stats=${JSON.stringify(base.stats)},latestDashboardRows=${JSON.stringify(rows)},loadingData=false,reportsView=null,formatName=learner=>learner.name;
 function Fixture(){const[homeExpanded,setHomeExpanded]=useState(false),[selected,setSelected]=useState('');const openBento=setSelected;return <main className="teacherShell isBento"><section className="bentoMenu">${fragment}<output>{selected}</output></section></main>;}createRoot(document.getElementById('root')).render(<Fixture/>);`;
 fs.writeFileSync(path.join(dir,'entry.js'),await transform(entry,'Fixture.jsx'));
 await new Promise((resolve,reject)=>webpackModule.webpack({mode:'development',target:'web',devtool:false,entry:path.join(dir,'entry.js'),output:{path:dir,filename:'bundle.js'},resolve:{modules:[path.resolve('node_modules')]}},(error,stats)=>error?reject(error):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()));
 const block=source.slice(source.indexOf('<style jsx global>'),source.indexOf('</style>')),css=block.slice(block.indexOf('`')+1,block.lastIndexOf('`')),bundle=fs.readFileSync(path.join(dir,'bundle.js'),'utf8');
 const browser=await chromium.launch({executablePath:process.env.CRL_BROWSER_EXECUTABLE,headless:true,args:['--no-sandbox','--no-zygote','--single-process','--disable-dev-shm-usage','--disable-gpu']});
 try{const page=await browser.newPage({viewport:{width:390,height:1000},isMobile:true,hasTouch:true});
 for(const width of [320,390,600,720,768,800,1024,1280,1440])for(const theme of ['light','dark']){
  await page.setViewportSize({width,height:1000});await page.setContent('<!doctype html><html data-crl-theme="'+theme+'"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><body style="margin:0"><div id="root"></div></body></html>');await page.addScriptTag({content:bundle});await page.locator('.bentoTile').first().waitFor();await page.waitForTimeout(350);
  const header=page.getByRole('button',{name:'Overview',exact:true});
  if(width<=720){
   const before=await page.locator('.bentoHome').boundingBox();assert.equal(await header.getAttribute('aria-expanded'),'false');assert.equal(await page.locator('.bentoHomeBody').isVisible(),false);
   await header.click({position:{x:8,y:20}});await page.waitForTimeout(90);const during=await page.locator('.bentoHome').boundingBox();await page.waitForTimeout(260);const after=await page.locator('.bentoHome').boundingBox();
   assert.ok(during.height>before.height+5&&during.height<after.height-5,JSON.stringify({width,before,during,after}));assert.equal(await header.getAttribute('aria-expanded'),'true');
   await page.locator('.bentoHomeChevron').click();await page.waitForTimeout(350);assert.equal(await header.getAttribute('aria-expanded'),'false');
   await header.focus();await page.keyboard.press('Enter');await page.waitForTimeout(350);assert.equal(await header.getAttribute('aria-expanded'),'true');
  }else assert.equal(await page.locator('.bentoHomeBody').isVisible(),true);
  const geometry=await page.evaluate(()=>({page:document.documentElement.scrollWidth,width:innerWidth,table:document.querySelector('.latestLearnerOverviewTable').scrollWidth,tableWidth:document.querySelector('.latestLearnerOverviewTable').clientWidth,buttons:[...document.querySelectorAll('.bentoTile')].map(n=>({w:n.clientWidth,font:parseFloat(getComputedStyle(n.querySelector('.bentoLabel')).fontSize),icon:n.querySelector('svg').getBoundingClientRect().width,labelWidth:n.querySelector('.bentoLabel').clientWidth,labelScroll:n.querySelector('.bentoLabel').scrollWidth,lines:n.querySelector('.bentoLabel').children.length}))}));
  assert.ok(geometry.page<=width+1,JSON.stringify({width,...geometry}));assert.ok(geometry.table<=geometry.tableWidth+1,JSON.stringify({width,...geometry}));for(const b of geometry.buttons){assert.ok(b.font>=17&&b.icon>=29);assert.ok(b.labelScroll<=b.labelWidth+1,JSON.stringify({width,b}));assert.ok(b.lines>=1&&b.lines<=2);}
  assert.equal(await page.getByRole('columnheader').allTextContents().then(x=>x.join('|')),'Name|Assessment Status');
  for(const [label,id]of [['Conduct Assessment','conduct'],['Assessment Records','records'],['Assessment Contents','activities'],['Analytics','analytics'],['Profile','profile'],['Report and Feedback','reports']]){await page.getByRole('button',{name:label,exact:true}).click();assert.equal(await page.locator('output').textContent(),id);}
  if(process.env.CRL_QA_SCREENSHOT_PREFIX&&[390,800,1440].includes(width))await page.screenshot({path:process.env.CRL_QA_SCREENSHOT_PREFIX+'-'+width+'-'+theme+'.png',fullPage:true});
  console.log('PASS main menu responsive layout, no horizontal scrolling, icons/labels and navigation',width,theme);
 }
 await page.setViewportSize({width:390,height:1000});await page.emulateMedia({reducedMotion:'reduce'});assert.ok(await page.locator('.bentoHomeReveal').evaluate(n=>getComputedStyle(n).transitionDuration.split(',').every(t=>parseFloat(t)<=0.001)));
 }finally{await browser.close();fs.rmSync(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
