/* Optional browser QA: CRL_BROWSER_EXECUTABLE=/path/to/chromium node scripts/verify-roster-sticky-browser.cjs
 * Requires Playwright in the test environment, not as a production dependency.
 * Uses the real action component and dashboard CSS with synthetic roster data.
 */
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');

(async () => {
  const { chromium } = require(process.env.CRL_PLAYWRIGHT_MODULE || 'playwright');
  const swc = require('next/dist/build/swc');
  const webpackModule = require('next/dist/compiled/webpack/webpack'); webpackModule.init();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crl-sticky-'));
  const transform = async (source, filename) => (await swc.transform(source, { filename, jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } } }, module: { type: 'commonjs' } })).code;
  const source = fs.readFileSync('components/RosterSelectionActions.jsx', 'utf8').replace('import styles from "./RosterSelectionActions.module.css";', 'const styles={slot:"crlStickySlot",bar:"crlStickyBar",active:"crlStickyActive"};');
  fs.writeFileSync(path.join(dir, 'actions.js'), await transform(source, 'Actions.jsx'));
  const entry = `
    import React,{useState,useRef} from ${JSON.stringify(require.resolve('react'))};
    import {createRoot} from ${JSON.stringify(require.resolve('react-dom/client'))};
    import Actions from './actions';
    function Fixture(){
      const [ids,setIds]=useState([]),[suspended,setSuspended]=useState(false),inline=useRef(null);
      window.suspendActions=setSuspended;
      return <main className="teacherShell isExpanded hasConductRoster"><section className="main">
        <header className="topbar">Conduct Assessment</header><div className="content"><div className="contentStage">
          <section className="panel conductLearnerPanel">
            <header className="panelHeader conductRosterHeader"><button className="containerBackArrow">←</button><div className="conductRosterHeading"><div className="conductClassContext"><span>School Year 2026-2027</span><span>Section: Sample Section</span></div><div className="panelHeaderTitle">Enrolled Learners</div></div><button className="learnerRefreshButton">↻</button></header>
            <div style={{padding:16}}><button className="toolbarButton">Offline Mode Settings</button></div>
            <div className="toolbar"><input className="searchInput" placeholder="Search learner name or LRN"/><select className="selectInput"><option>All Sex</option></select><select className="selectInput"><option>All Status</option></select><select className="selectInput"><option>Name (A-Z)</option></select><button className="toolbarButton">Import</button><button className="toolbarButton">Add</button><div ref={inline} className="rosterSelectionInline"/></div>
            <Actions inlineTargetRef={inline} selectionCount={ids.length} suspended={suspended}>
              <button className="toolbarButton" onClick={()=>setIds(Array.from({length:50},(_,i)=>i))}>Select All</button>
              <button className="toolbarButton" disabled={!ids.length} onClick={()=>setIds([])}>Deselect All</button>
              {ids.length>0&&<button className="toolbarButton dangerButton" onClick={()=>{window.deleteRequested=ids.length}}>Delete Selected ({ids.length})</button>}
            </Actions>
            {Array.from({length:50},(_,i)=><article className="syntheticRow" key={i}><label>Select <input type="checkbox" aria-label={'Select learner '+i} checked={ids.includes(i)} onChange={()=>setIds(current=>current.includes(i)?current.filter(id=>id!==i):[...current,i])}/></label><p>Sample Learner {i+1}</p><p>No Assessment</p><button>Start</button></article>)}
          </section></div></div></section></main>;
    }const root=createRoot(document.getElementById('root'));root.render(<Fixture/>);window.fixtureUnmount=()=>root.unmount();
  `;
  fs.writeFileSync(path.join(dir, 'entry.js'), await transform(entry, 'Fixture.jsx'));
  await new Promise((resolve, reject) => webpackModule.webpack({ mode: 'development', target: 'web', devtool: false, entry: path.join(dir, 'entry.js'), output: { path: dir, filename: 'bundle.js' }, resolve: { modules: [path.resolve('node_modules')] } }, (error, stats) => error ? reject(error) : stats.hasErrors() ? reject(Error(stats.toString({ all: false, errors: true }))) : resolve()));
  const pageSource = fs.readFileSync('app/teacher/page.jsx', 'utf8');
  const styleStart = pageSource.indexOf('<style jsx global>');
  assert.ok(styleStart >= 0);
  const styleBlock = pageSource.slice(styleStart, pageSource.indexOf('</style>', styleStart));
  const globalCss = styleBlock.slice(styleBlock.indexOf('`') + 1, styleBlock.lastIndexOf('`'));
  const actionCss = fs.readFileSync('components/RosterSelectionActions.module.css', 'utf8').replace(/\.slot\b/g, '.crlStickySlot').replace(/\.bar\b/g, '.crlStickyBar').replace(/\.active\b/g, '.crlStickyActive');
  const bundle = fs.readFileSync(path.join(dir, 'bundle.js'), 'utf8');
  const browser = await chromium.launch({ executablePath: process.env.CRL_BROWSER_EXECUTABLE, headless: true, args: JSON.parse(process.env.CRL_BROWSER_ARGS || '["--no-sandbox","--no-zygote","--single-process","--disable-dev-shm-usage","--disable-gpu"]') });
  try {
    const page = await browser.newPage({ viewport: { width:320,height:850 }, isMobile:true,hasTouch:true });
    for (const width of [320, 390, 768, 1024, 1440]) for (const theme of ['light', 'dark']) {
      await page.evaluate(()=>window.fixtureUnmount?.());
      await page.setViewportSize({ width,height:850 });
      const errors = [],onError=error=>errors.push(error.message); page.on('pageerror',onError);
      await page.setContent('<!doctype html><html data-crl-theme="'+theme+'"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+globalCss+'\n'+actionCss+'\nbody{margin:0}.syntheticRow{min-height:210px;padding:18px;border-bottom:1px solid var(--crl-line);box-sizing:border-box}</style><div id="root"></div></html>');
      await page.addScriptTag({ content: bundle });
      const group = page.getByRole('group', { name: 'Learner selection actions' });
      await group.waitFor(); await page.waitForTimeout(320);
      if(width<=768){const gap=await page.evaluate(()=>document.querySelector('.crlStickyBar').getBoundingClientRect().top-document.querySelector('.toolbar').getBoundingClientRect().bottom);assert.ok(gap>=12,JSON.stringify({width,gap}));}
      await page.getByRole('checkbox', { name: 'Select learner 15', exact: true }).check();
      await page.getByRole('button', { name: 'Delete Selected (1)', exact: true }).waitFor();
      assert.equal(await group.count(), 1);
      if (width <= 768) {
        const state = () => page.evaluate(() => {
          const slot=document.querySelector('.crlStickySlot'),rect=slot.getBoundingClientRect(),toolbar=document.querySelector('.toolbar').getBoundingClientRect();
          return { top:rect.top,left:rect.left,right:rect.right,width:rect.width,height:rect.height,origin:toolbar.bottom+scrollY,y:scrollY,position:getComputedStyle(slot).position,pageWidth:document.documentElement.scrollWidth,viewport:innerWidth };
        });
        let s=await state(); assert.equal(s.position,'sticky'); assert.ok(Math.abs(s.top)<1,JSON.stringify(s));
        // Large alternating jumps approximate fast swipes without waiting for a
        // JavaScript positioning callback. Sample on the next rendered frame.
        for (const y of [5000,1200,8000,1800,9500,700,6000,0]) {
          await page.evaluate(y=>new Promise(resolve=>{scrollTo(0,y);requestAnimationFrame(()=>resolve());}),y);
          s=await state(); const expected=Math.max(0,s.origin-s.y);
          assert.ok(Math.abs(s.top-expected)<1,JSON.stringify({width,theme,expected,...s}));
          assert.ok(s.left>=-1&&s.right<=width+1,JSON.stringify(s));
          assert.ok(s.pageWidth<=s.viewport+1,JSON.stringify(s));
        }
        await page.evaluate(()=>scrollTo(0,5000));
        await page.evaluate(()=>{
          window.stickySamples=[];window.trackSticky=true;
          const sample=()=>{
            if(!window.trackSticky)return;
            const top=document.querySelector('.crlStickySlot').getBoundingClientRect().top;
            const origin=document.querySelector('.toolbar').getBoundingClientRect().bottom;
            window.stickySamples.push({top,expected:Math.max(0,origin)});
            requestAnimationFrame(sample);
          };requestAnimationFrame(sample);
        });
        const session=await page.context().newCDPSession(page);
        for (const distance of [-1500,1000,-2200,1400]) {
          await session.send('Input.synthesizeScrollGesture',{x:Math.round(width/2),y:600,yDistance:distance,speed:8000,gestureSourceType:'touch'});
          s=await state(); assert.ok(Math.abs(s.top-Math.max(0,s.origin-s.y))<1,JSON.stringify(s));
        }
        const samples=await page.evaluate(()=>{window.trackSticky=false;return window.stickySamples;});
        assert.ok(samples.length>0);assert.deepEqual(samples.filter(s=>Math.abs(s.top-s.expected)>=1),[]);
        await page.getByRole('button',{name:'Select All',exact:true}).click();
        await page.getByRole('button',{name:'Delete Selected (50)',exact:true}).click();
        assert.equal(await page.evaluate(()=>window.deleteRequested),50);
        await page.getByRole('button',{name:'Deselect All',exact:true}).click();
        assert.equal(await page.locator('input[type=checkbox]:checked').count(),0);
        assert.equal(await page.locator('.crlStickyActive').count(),0);
        if(width===390&&theme==='light'){
          await page.getByRole('checkbox',{name:'Select learner 15',exact:true}).check();
          await page.setViewportSize({width:1024,height:850});
          await page.waitForFunction(()=>Boolean(document.querySelector('[role=group]')?.closest('.toolbar')));
          assert.equal(await group.count(),1);
          await page.setViewportSize({width,height:850});
          await page.waitForFunction(()=>Boolean(document.querySelector('.crlStickyActive')));
          assert.equal(await group.count(),1);
          assert.equal(await page.locator('input[type=checkbox]:checked').count(),1);
          await page.evaluate(()=>window.suspendActions(true));
          await page.waitForFunction(()=>!document.querySelector('.crlStickyActive'));
          await page.evaluate(()=>window.suspendActions(false));
          await page.waitForFunction(()=>Boolean(document.querySelector('.crlStickyActive')));
          if(process.env.CRL_QA_SCREENSHOT)await page.screenshot({path:process.env.CRL_QA_SCREENSHOT});
        }
      } else {
        assert.equal(await group.evaluate(node=>Boolean(node.closest('.toolbar'))),true);
        assert.equal(await page.locator('.crlStickyActive').count(),0);
      }
      assert.deepEqual(errors,[]); console.log('PASS browser native roster actions',width,theme); page.off('pageerror',onError);
    }
  } finally { await browser.close(); fs.rmSync(dir,{recursive:true,force:true}); }
})().catch(error=>{console.error(error);process.exitCode=1;});
