const assert=require('node:assert/strict'),fs=require('node:fs'),postcss=require('postcss');
(async()=>{
 const {buildSyntheticBosyPlan}=require('./lib/syntheticBosyPlan.cjs'),{buildSyntheticMosyImprovement,PROFILES}=require('./lib/syntheticMosyImprovement.cjs'),{calculateFallbackProfile}=await import('../lib/recordViewModel.mjs');
 const content={letters:'ABCDEFGHIJ'.split(''),words:Array.from({length:10},(_,i)=>'word'+i),stories:[{title:'Example story',text:Array(100).fill('word').join(' ')}]};
 for(let seed=1;seed<=20;seed++){
  let state=seed;const random=()=>((state=(1664525*state+1013904223)>>>0)/2**32),original=buildSyntheticBosyPlan({learnerIds:Array.from({length:32},(_,i)=>1001+i),selectionForCode:()=>content,seedTag:'UNIT-'+seed,random});
  const baselines=original.map((r,i)=>({...r,sessionId:10000+i,hostId:20000+i})),plan=buildSyntheticMosyImprovement({baselines,selectionForCode:()=>content,random}),counts=PROFILES.map(p=>plan.filter(r=>r.profile===p).length);assert.deepEqual(counts,[9,11,3,2,7]);assert.equal(new Set(plan.map(r=>r.remarks)).size,18);
  let improved=0;
  for(const r of plan){const b=baselines.find(b=>b.learnerId===r.learnerId);assert.equal(r.code,b.code);assert.equal(r.sessionId,b.sessionId);assert.equal(r.synthetic,true);assert.ok(PROFILES.indexOf(r.profile)>=PROFILES.indexOf(b.profile));if(r.profile!==b.profile)improved++;
   assert.ok(r.task1>=b.task1&&r.task2>=b.task2);assert.equal(r.letters.filter(x=>x.correct).length,r.task1);assert.equal(r.words.filter(x=>x.correct).length,r.task2);assert.equal(r.miscueRows.length,r.miscues);assert.equal(new Set(r.miscueRows.map(m=>m.index)).size,r.miscues);assert.equal(r.questions.filter(x=>x.correct).length,r.comprehension);
   if(r.timerSeconds===null){assert.equal(r.profile,PROFILES[0]);assert.ok(r.task1+r.task2<=10);assert.equal(r.questions.length,0);}else{assert.ok(r.task1+r.task2>10);assert.ok(r.accuracy>=b.accuracy&&r.comprehension>=b.comprehension);assert.equal(calculateFallbackProfile(r.accuracy,r.comprehension),r.profile);assert.equal(100-r.miscues,r.accuracy);assert.ok(r.timerSeconds<120);if(b.timerSeconds)assert.ok(r.accuracy/r.timerSeconds>=b.accuracy/b.timerSeconds);}
  }assert.equal(improved,13);
 }
 const home=fs.readFileSync('app/teacher/page.jsx','utf8'),shared=fs.readFileSync('app/theme-tokens.css','utf8'),tokens=s=>Object.fromEntries([...s.matchAll(/(--crl-[\w-]+)\s*:\s*([^;}]+)/g)].map(m=>[m[1],m[2].trim()])),teacherDark=home.match(/html\[data-crl-theme="dark"\] \{([^}]+)\}/)[1];assert.deepEqual(tokens(shared),tokens(teacherDark));assert.ok(fs.readFileSync('app/layout.jsx','utf8').includes('import "./theme-tokens.css";'));assert.ok(shared.includes('color-scheme:dark'));
 for(const file of ['app/admin/admin.module.css','components/SystemAdmin.module.css','components/Portal.module.css','components/Coordinator.module.css','components/Select.module.css','components/ClassWorkspace.module.css']){
  postcss.parse(fs.readFileSync(file,'utf8')).walkRules(rule=>{if(!rule.selector.split(',').every(s=>/data-crl-theme=['"]?dark/.test(s)))return;rule.walkDecls(d=>{assert.ok(!d.prop.startsWith('--crl-'),'Role styles inherit shared tokens: '+file);assert.ok(!/#(?:102131|112432|172c3c|203c52|35546c)\b/i.test(d.value),'No superseded teal palette in dark rules: '+file);});});
 }
 assert.ok(!home.includes("['assessed','Learners Assessed'"));assert.ok(home.includes("key==='eosy'?' statCardWide':''"));assert.ok(home.includes('.homeStatsGrid .statCardWide{grid-column:1/-1}'));const skeleton=fs.readFileSync('components/DashboardSkeleton.jsx','utf8');assert.ok(skeleton.includes('<Metrics count={5}/>'));
 console.log('PASS matched MoSY improvement across 20 runs, 9/11/3/2/7 distribution, 13 upward transitions, evidence/classification parity, five-card overview and shared charcoal tokens including portalled UI.');
})().catch(e=>{console.error(e);process.exitCode=1;});
