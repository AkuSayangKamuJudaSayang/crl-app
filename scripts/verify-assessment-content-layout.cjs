/* Default: real JSX render/control regression. Optional --browser uses Playwright
 * and CRL_BROWSER_EXECUTABLE supplied by the test environment, not app dependencies.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');

(async()=>{
 const page=fs.readFileSync('app/teacher/page.jsx','utf8'),swc=require('next/dist/build/swc');
 const start=page.indexOf('<div className="panel manageAssessmentPanel">'),end=page.indexOf('                      <input\n                        ref={storyImportInputRef}',start);
 assert.ok(start>0&&end>start);
 const fragment=page.slice(start,end)+'</div></div>';
 const transform=async(text,filename)=>(await swc.transform(text,{filename,jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'automatic'}}},module:{type:'commonjs'}})).code;
 const code=await transform('export default function View(){return ('+fragment+');}','Controls.jsx');
 const calls=[];
 const base={PERIODS:['BoSY','MoSY','EoSY'],activityPeriod:'BoSY',activityTab:'letters',currentContentMode:'fixed',ASSESSMENT_CONTENT_REQUIREMENTS:{letters:10,words:10,stories:1},contentDefaultLabel:type=>type,
  setActivityPeriod:value=>calls.push(['period',value]),setActivityTab:value=>calls.push(['category',value]),setContentModes(){},normalizeAssessmentContentModes:x=>x,setActivityPeriodDirty(){},
  setStoryImportDragActive:value=>calls.push(['import-drag',value]),setStoryImport:value=>calls.push(['import',value.status]),editActivity:(type,index)=>calls.push(['add',type,index]),
  savingActivities:false,activityDirtyPeriods:{BoSY:true},saveActivities:async period=>{calls.push(['save',period]);return true;},showToast:text=>calls.push(['toast',text])};
 const render=vars=>{const ctx={module:{exports:{}},require,...base,...vars};ctx.exports=ctx.module.exports;vm.runInNewContext(code,ctx);const node=ctx.module.exports.default();return{node,html:renderToStaticMarkup(node)};};
 const flatten=node=>{const result=[];const visit=n=>{if(!n||typeof n!=='object')return;result.push(n);React.Children.forEach(n.props?.children,visit);};visit(node);return result;};
 const text=node=>React.Children.toArray(node.props?.children).map(child=>typeof child==='string'?child:typeof child==='object'?text(child):'').join('').trim();
 for(const type of ['letters','words','stories']){
  const {node,html}=render({activityTab:type}),all=flatten(node),buttons=all.filter(n=>n.type==='button');
  assert.equal(all.filter(n=>n.props?.className==='assessmentContentToolbar').length,1);
  assert.equal(all.filter(n=>n.type==='h2'&&n.props.className==='activityItemHeading').length,1);
  assert.ok(!html.includes('Assessment Content'));assert.ok(!html.includes('Manage Assessment'));
  assert.ok(html.includes(type==='letters'?'>Letters</h2>':type==='words'?'>Words</h2>':'>Stories</h2>'));
  const category=all.find(n=>n.props?.['aria-label']==='Content category'),period=all.find(n=>n.props?.['aria-label']==='Assessment period');
  assert.equal(flatten(category).filter(n=>n.type==='button').length,3);assert.equal(flatten(period).filter(n=>n.type==='button').length,3);
  buttons.find(n=>text(n)==='MoSY').props.onClick();buttons.find(n=>text(n)==='Words').props.onClick();
  buttons.find(n=>text(n)===(type==='stories'?'+ Add Story':'+ Add Item')).props.onClick();
  await buttons.find(n=>text(n)==='Save').props.onClick();
  if(type==='stories'){buttons.find(n=>text(n)==='Import file').props.onClick();assert.ok(calls.some(x=>x[0]==='import'&&x[1]==='idle'));}
  assert.ok(calls.some(x=>x[0]==='add'&&x[1]===type&&x[2]===-1));
 }
 assert.ok(calls.some(x=>x[0]==='period'&&x[1]==='MoSY'));assert.ok(calls.some(x=>x[0]==='category'&&x[1]==='words'));assert.ok(calls.some(x=>x[0]==='save'&&x[1]==='BoSY'));
 for(const vars of [{savingActivities:true},{activityDirtyPeriods:{BoSY:false}}])assert.equal(flatten(render(vars).node).find(n=>n.type==='button'&&n.props.className?.includes('assessmentSaveButton')).props.disabled,true);
 assert.ok(/id: "activities",\s*label: "Assessment Contents"/.test(page));
 assert.ok(page.includes('Your assessment content changes have not been saved yet.'));
 console.log('PASS actual content selectors/headings render once per group; period/category, Add, story Import and Save callbacks and disabled guards remain intact; Assessment Contents replaces the old menu label without a duplicate panel title');
 if(!process.argv.includes('--browser'))return;

 const {chromium}=require(process.env.CRL_PLAYWRIGHT_MODULE||'playwright'),os=require('node:os'),path=require('node:path');
 const webpackModule=require('next/dist/compiled/webpack/webpack');webpackModule.init();
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'crl-content-ui-'));
 const entry=`
  import React,{useState} from ${JSON.stringify(require.resolve('react'))};import{createRoot}from ${JSON.stringify(require.resolve('react-dom/client'))};
  const PERIODS=['BoSY','MoSY','EoSY'],ASSESSMENT_CONTENT_REQUIREMENTS={letters:10,words:10,stories:1},contentDefaultLabel=type=>type,normalizeAssessmentContentModes=x=>x;
  function Fixture(){
   const[activityPeriod,setActivityPeriod]=useState('BoSY'),[activityTab,setActivityTab]=useState('letters'),[contentModes,setContentModes]=useState({}),[activityDirtyPeriods,setDirty]=useState({}),[status,setStatus]=useState('');
   const currentContentMode=contentModes[activityPeriod]?.[activityTab]||'fixed',savingActivities=false;
   const setActivityPeriodDirty=(period,value)=>setDirty(current=>({...current,[period]:value}));
   const setStoryImportDragActive=()=>{},setStoryImport=()=>setStatus('Story import requested'),editActivity=(type,index)=>setStatus('Add '+type+' '+index);
   const saveActivities=async period=>{setActivityPeriodDirty(period,false);return true;},showToast=setStatus;
   return <main className="teacherShell isExpanded"><section className="main"><header className="topbar"><span className="topbarTitle">Assessment Contents</span></header><div className="content"><div className="contentStage">${fragment}<output role="status">{status}</output></div></div></section></main>;
  }createRoot(document.getElementById('root')).render(<Fixture/>);
 `;
 fs.writeFileSync(path.join(dir,'entry.js'),await transform(entry,'Fixture.jsx'));
 await new Promise((resolve,reject)=>webpackModule.webpack({mode:'development',target:'web',devtool:false,entry:path.join(dir,'entry.js'),output:{path:dir,filename:'bundle.js'},resolve:{modules:[path.resolve('node_modules')]}},(error,stats)=>error?reject(error):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()));
 const block=page.slice(page.indexOf('<style jsx global>'),page.indexOf('</style>')),css=block.slice(block.indexOf('`')+1,block.lastIndexOf('`')),bundle=fs.readFileSync(path.join(dir,'bundle.js'),'utf8');
 const browser=await chromium.launch({executablePath:process.env.CRL_BROWSER_EXECUTABLE,headless:true,args:JSON.parse(process.env.CRL_BROWSER_ARGS||'["--no-sandbox","--no-zygote","--single-process","--disable-dev-shm-usage","--disable-gpu"]')});
 try{
  const view=await browser.newPage({viewport:{width:320,height:900},isMobile:true,hasTouch:true});
  for(const width of [320,390,600,768,800,1280,1440])for(const theme of ['light','dark']){
   await view.setViewportSize({width,height:900});await view.setContent('<!doctype html><html data-crl-theme="'+theme+'"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><body style="margin:0"><div id="root"></div></body></html>');await view.addScriptTag({content:bundle});
   const categories=view.getByRole('group',{name:'Content category'}),periods=view.getByRole('group',{name:'Assessment period'});
   await categories.waitFor();await view.waitForTimeout(300);
   assert.equal(await view.locator('.manageAssessmentPanel .panelHeaderTitle').count(),0);
   assert.equal(await view.locator('.topbarTitle').textContent(),'Assessment Contents');
   const geometry=await view.evaluate(()=>({pageWidth:document.documentElement.scrollWidth,viewport:innerWidth,category:[...document.querySelectorAll('.activityTabs button')].map(n=>({top:n.getBoundingClientRect().top,height:n.getBoundingClientRect().height})),period:[...document.querySelectorAll('.periodTabs button')].map(n=>({top:n.getBoundingClientRect().top,height:n.getBoundingClientRect().height}))}));
   assert.ok(geometry.pageWidth<=geometry.viewport+1,JSON.stringify({width,...geometry}));
   if(width>640)for(const button of [...geometry.category,...geometry.period])assert.ok(Math.abs(button.top-geometry.category[0].top)<1,JSON.stringify({width,...geometry}));
   else assert.ok(geometry.period[0].top>geometry.category[0].top);
   for(const type of ['Letters','Words','Stories']){
    await categories.getByRole('button',{name:type,exact:true}).click();const heading=view.getByRole('heading',{name:type,exact:true});await heading.waitFor();await view.waitForTimeout(220);
    const add=view.getByRole('button',{name:type==='Stories'?'+ Add Story':'+ Add Item',exact:true}),save=view.getByRole('button',{name:'Save',exact:true});
    const h=await heading.boundingBox(),a=await add.boundingBox(),s=await save.boundingBox();
    assert.ok(a.x+a.width<=width+1&&s.x+s.width<=width+1&&h.x>=0,JSON.stringify({width,type,h,a,s}));
    assert.ok(Math.abs(a.y-s.y)<1);assert.ok(s.height>=43.9&&a.height>=43.9,JSON.stringify({width,type,a,s}));
    if(width>560||type!=='Stories')assert.ok(Math.abs(h.y+h.height/2-a.y-a.height/2)<1,JSON.stringify({width,type,h,a}));
    else{const imp=await view.getByRole('button',{name:'Import file',exact:true}).boundingBox();assert.ok(Math.abs(h.y+h.height/2-imp.y-imp.height/2)<1,JSON.stringify({width,type,h,imp}));}
    await add.click();assert.ok((await view.getByRole('status').textContent()).includes('Add '+type.toLowerCase()));
    if(type==='Stories'){await view.getByRole('button',{name:'Import file',exact:true}).click();assert.equal(await view.getByRole('status').textContent(),'Story import requested');}
    if(width===390&&theme==='light'&&process.env.CRL_QA_SCREENSHOT_PREFIX)await view.screenshot({path:process.env.CRL_QA_SCREENSHOT_PREFIX+'-'+type.toLowerCase()+'.png'});
   }
   await periods.getByRole('button',{name:'MoSY',exact:true}).click();assert.equal(await periods.getByRole('button',{name:'MoSY',exact:true}).getAttribute('aria-pressed'),'true');
   await view.getByRole('radio',{name:/Randomize each assessment/}).click();assert.equal(await view.getByRole('button',{name:'Save',exact:true}).isEnabled(),true);
   await view.getByRole('button',{name:'Save',exact:true}).click();assert.equal(await view.getByRole('status').textContent(),'MoSY content saved.');
   if(width===1440&&theme==='light'&&process.env.CRL_QA_SCREENSHOT_PREFIX)await view.screenshot({path:process.env.CRL_QA_SCREENSHOT_PREFIX+'-desktop.png'});
   console.log('PASS content UI browser headings/selectors, touch sizes, period/category and Save/Add/Import',width,theme);
  }
 }finally{await browser.close();fs.rmSync(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
