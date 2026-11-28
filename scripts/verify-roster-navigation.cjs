const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
(async()=>{
 const names=await import('../lib/learnerNames.mjs');for(const v of [null,'','N/A','NA','NONE','—'])assert.equal(names.learnerMiddleInitial({middle_name:v}),'—');for(const v of ['Marie','M.','M'])assert.equal(names.learnerMiddleInitial({middle_name:v}),'M.');assert.equal(names.learnerMiddleInitial({middleName:'Ñora'}),'Ñ.');
 const page=fs.readFileSync('app/teacher/page.jsx','utf8').replace(/\r\n/g,'\n'),swc=require('next/dist/build/swc');
 const compile=async(src,vars)=>{const c=await swc.transform(src,{filename:'view.jsx',jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'automatic'}}},module:{type:'commonjs'}});const ctx={module:{exports:{}},exports:{},require,...vars};ctx.exports=ctx.module.exports;vm.runInNewContext(c.code,ctx);return ctx.module.exports.default;};
 const start=page.indexOf('<div className="tableWrap learnerRoster"'),end=page.indexOf('</table>',start)+8;
 const periodModel=await import('../lib/learnerPeriodResults.mjs');
 const records=await import('../lib/recordViewModel.mjs');
 const recommendationModel=await import('../lib/learnerRecommendations.mjs');
 const results=[
  {id:4,learner_id:1,assessment_period:'BoSY',is_completed:true,task1_score:2,task2_score:3},
  {id:10,learner_id:1,assessment_period:'BoSY',is_completed:false,date_administered:'2026-11-05'},
  {id:5,learner_id:1,assessment_period:'MoSY',is_completed:true,date_administered:'2026-11-15',task1_score:9,task2_score:9,overall_classification:'Developing Reader'},
  {id:6,learner_id:1,assessment_period:'MoSY',is_completed:true,date_administered:'2026-11-15',task1_score:9,task2_score:9,overall_classification:'Reading At Grade Level',offline_pending:true},
  {id:7,learner_id:2,assessment_period:'EoSY',is_completed:false},
 ];
 const byLearner=periodModel.latestLearnerPeriodResults(results);
 const props={...periodModel,...records,...recommendationModel,remarksPeriod:"BoSY",recommendationKey:row=>row.id,getRecommendationDraft(){},setRecommendationDraft(){},saveLearnerRecommendation(){},LearnerRemarksField:({name,period,value})=>React.createElement("textarea",{"aria-label":period+" recommendation remarks for "+name,defaultValue:value}),Select:({children,...rest})=>React.createElement("select",{...rest,onChange:()=>{}},children),learnerPeriodResults:byLearner,PERIODS:['BoSY','MoSY','EoSY'],periodEligibility:(await import('../lib/classWorkspace.mjs')).periodEligibility,selectedClass:{id:'s',schoolYearId:'y'},setAnalyticsYearId(){},setAnalyticsSectionId(){},selectAnalyticsLearner(){},setAnalyticsMobileResultOpen(){},filteredLearners:[{id:1,lrn:'000000000001',last_name:'SAMPLE',first_name:'LEARNER',middle_name:'M.',suffix:'Jr.',sex:'Female'},{id:2,lrn:'000000000002',lastName:'TEST',firstName:'SECOND',sex:'Male'}],assessments:results,selectedLearnerIds:[1],classReadonly:false,startingAssessment:false,liveTimelineIssue:()=>'',toggleLearnerSelection(){},selectAllFilteredLearners(){},clearLearnerSelection(){}};
 const Roster=await compile('export default function View(){return ('+page.slice(start,end)+'</div>);}',props);
 const html=renderToStaticMarkup(React.createElement(Roster));
 assert.equal((html.match(/scope="col"/g)||[]).length,5);
 assert.equal((html.match(/scope="row"/g)||[]).length,2);
 assert.equal((html.match(/<td[ >]/g)||[]).length,8);
 for(const label of ['LRN:','Sex:','Recommendation remarks','Remarks period','<textarea','BoSY','MoSY','EoSY','M. Jr.','Female','TEST, SECOND','>Start<','>View<','Low Emerging Reader','Reading At Grade Level','Completed · Sync pending','Incomplete','Not yet assessed'])assert.ok(html.includes(label),label);
 assert.ok(!html.includes('Developing Reader'));
 assert.ok(!html.includes('Delete'));
 assert.match(page,/\.learnerRoster \.rosterIdentity \{\s+position:sticky; left:0;/);
 assert.doesNotMatch(html, /Select all visible learners|Reading follow-up|Export follow-up report|Add recommendation|Edit recommendation/);
 assert.equal((html.match(/<textarea/g)||[]).length,2);
 assert.equal(periodModel.countLearnerMiscues({}),null);
 assert.equal(periodModel.countLearnerMiscues({passage_miscues:[]}).size,0);
 const miscues=periodModel.countLearnerMiscues({passage_miscues:[{miscue_type:'Last Word Read'},{miscue_type:'SelfCorrection'},{miscueType:'Self-correction'},{type:'Omission'}]});
 assert.equal(miscues.get('selfcorrection'),2);
 assert.equal(miscues.get('omission'),1);
 assert.equal(miscues.size,2);
 const shared=fs.readFileSync('components/SharedAssessmentResults.jsx','utf8');
 const Summary=await compile(shared.slice(shared.indexOf('function LearnerComparisonTable'),shared.indexOf('export function AnalyticsLearnerResultPanel'))+'export default LearnerPeriodSummary;',{
  ...periodModel,...records,useState:React.useState,PERIODS:['BoSY','MoSY','EoSY'],ANALYTICS_MISCUE_PALETTE:{Omission:[],Substitution:[]},
 });
 const summary=renderToStaticMarkup(React.createElement(Summary,{periodResults:[
  {period:'BoSY',result:{is_completed:true,task1_score:0,task2_score:0,timer_seconds:null}},
  {period:'MoSY',result:{is_completed:true,task1_score:9,task2_score:9,timer_seconds:60,words_read:95,comprehension_score:5,miscue_accuracy:95,total_miscues:5},detail:{passage_miscues:[{miscue_type:'Omission'},{miscue_type:'Last Word Read'}]}},
  {period:'EoSY',result:{is_completed:true,task1_score:9,task2_score:9,timer_seconds:120,words_read:80,comprehension_score:4,miscue_accuracy:80,total_miscues:20}},
 ]}));
 for(const label of ['Reading Performance','Miscues by Type','1 min 0 sec','2 min 0 sec','Total miscues','95.00','40.00','Not administered','Details unavailable'])assert.ok(summary.includes(label),label);
 assert.match(summary,/>Omission<\/th><td role="cell">Not administered<\/td><td role="cell">1<\/td><td role="cell">Details unavailable<\/td>/);
 assert.match(summary,/>Substitution<\/th><td role="cell">Not administered<\/td><td role="cell">0<\/td><td role="cell">Details unavailable<\/td>/);
 assert.doesNotMatch(summary,/>Measure<|Total scored miscues/);
 assert.doesNotMatch(summary,/<button|Word comparison/);
 const {validateLearnerRecommendationChanges,applyLearnerRecommendationChanges,projectLearnerRecommendations}=recommendationModel;
 assert.deepEqual(validateLearnerRecommendationChanges({BoSY:'  Practice  ',EoSY:'  '}),{BoSY:'Practice',EoSY:''});
 assert.throws(()=>validateLearnerRecommendationChanges({bogus:'Practice'}),/valid assessment period/);
 assert.throws(()=>validateLearnerRecommendationChanges({BoSY:'a'.repeat(1001)}),/1,000 characters/);
 assert.deepEqual(applyLearnerRecommendationChanges({BoSY:'Original',MoSY:'Keep',EoSY:'Clear'},{BoSY:'Update',EoSY:''}),{BoSY:'Update',MoSY:'Keep'});
 const roster=[{id:81,local_id:-81,class_section_id:'section',period_recommendations:{BoSY:'Original'}},{id:82,class_section_id:'other'}];
 const projected=projectLearnerRecommendations(roster,[
   {kind:'save_learner_recommendations',body:{learner_id:-81,class_section_id:'section',recommendations:{MoSY:'Local'}}},
   {kind:'save_learner_recommendations',body:{learner_id:81,class_section_id:'section',recommendations:{EoSY:'Pending'}}},
   {kind:'save_learner_recommendations',body:{learner_id:81,class_section_id:'other',recommendations:{BoSY:'Ignore'}}},
 ]);
 assert.deepEqual(projected[0].period_recommendations,{BoSY:'Original',MoSY:'Local',EoSY:'Pending'});
 assert.equal(projected[1],roster[1]);
 const followUp=await import('../lib/readingFollowUp.mjs');
 const low=followUp.readingFollowUpGuidance('Low Emerging Reader');
 assert.match(low.recommendation,/letter sounds.*blending/);
 assert.deepEqual(low.interventions.map(([label])=>label),['Letter–sound practice','Oral rhyming and blending','Guided word decoding']);
 assert.notDeepEqual(followUp.readingFollowUpGuidance('Reading At Grade Level').interventions,low.interventions);
 assert.equal(followUp.readingFollowUpGuidance('').recommendation,'');
 const followUpLearner={id:1,lrn:'000000000001',first_name:'Synthetic',last_name:'Learner',period_recommendations:{BoSY:'=1+1'}};
 assert.equal(followUp.matchesReadingFollowUp(followUpLearner,byLearner.get('1').BoSY,'BoSY','Low Emerging Reader','with'),true);
 assert.equal(followUp.matchesReadingFollowUp(followUpLearner,byLearner.get('1').MoSY,'MoSY','Low Emerging Reader','with'),false);
 assert.equal(followUp.matchesReadingFollowUp(followUpLearner,byLearner.get('1').MoSY,'MoSY','Reading At Grade Level','without'),true);
 assert.equal(followUp.matchesReadingFollowUp(followUpLearner,undefined,'EoSY','unassessed','without'),true);
 const {buildReadingFollowUpReport}=await import('../lib/readingFollowUpExport.js');
 const xlsx=await import('xlsx');
 const {blob,filename}=await buildReadingFollowUpReport({learners:[followUpLearner],results:byLearner,period:'BoSY',section:'Sample',year:'2026-2027'});
 const sheet=xlsx.read(await blob.arrayBuffer(),{type:'array'}).Sheets['Reading Follow-Up'];
 assert.match(filename,/2026-2027_Sample_BoSY\.xlsx$/);
 assert.equal(sheet.D2.v,'000000000001');
 assert.equal(sheet.G2.v,'Low Emerging Reader');
 assert.equal(sheet.H2.v,'=1+1');
 assert.equal(sheet.H2.f,undefined);
 assert.equal(sheet['!autofilter'].ref,'A1:H2');
 const route=fs.readFileSync('app/api/assessment/route.js','utf8');
 const saveStart=route.indexOf('    if (action === "save_learner_recommendations")');
 const saveEnd=route.indexOf('    if (action === "reconcile_offline_assessment")',saveStart);
 const userId=9,sectionId='synthetic-section',learnerId=81;
 let saved={BoSY:'First',MoSY:'Keep'};
 let owned=true,identity;
 const tx={learner:{
  findFirst:async({where})=>{identity={...where};return owned?{periodRecommendations:saved}:null;},
  update:async({data})=>{saved=data.periodRecommendations;},
 }};
 const scope=vm.createContext({
  ...recommendationModel,userId,
  prisma:{$transaction:async work=>work(tx)},
  responseJson:(data,status=200)=>({data,status}),
  assertRosterVersion:async(_tx,owner,version)=>{assert.equal(owner,userId);assert.equal(version,2);},
  lockClass:async(_tx,owner,id)=>{assert.equal(owner,userId);assert.equal(id,sectionId);return{id};},
 });
 const save=vm.runInContext('(async (action,body)=>{'+route.slice(saveStart,saveEnd)+'})',scope);
 const payload={learner_id:learnerId,class_section_id:sectionId,roster_version:2,recommendations:{BoSY:'New',EoSY:'End'}};
 await save('save_learner_recommendations',payload);
 await save('save_learner_recommendations',payload);
 assert.deepEqual(identity,{id:learnerId,teacherId:userId,classSectionId:sectionId});
 assert.deepEqual(saved,{BoSY:'New',MoSY:'Keep',EoSY:'End'});
 owned=false;
 await assert.rejects(()=>save('save_learner_recommendations',payload),/unavailable in the selected class/);
 const comparison=await import('../lib/profileComparison.mjs');
 const labels=['Reading At Grade Level'],periods=[{period:'BoSY',total:1,profiles:[{label:labels[0],count:1}]},{period:'MoSY',total:0,profiles:[]},{period:'EoSY',total:0,profiles:[]}];
 const row=comparison.profileComparisonData(periods).rows.find(r=>r.label===labels[0]);assert.equal(row.values[0].count,1);assert.equal(row.values[1].count,null);assert.equal(row.values[2].assessed,false);
 const zero=comparison.profileComparisonData(periods.map(p=>({...p,total:1}))).rows.find(r=>r.label===labels[0]);assert.equal(zero.values[1].count,0);assert.equal(zero.values[1].assessed,true);
 assert.ok(page.includes('<ClassScopeSidebar'));assert.ok(page.includes('className="bentoClose"\n              onClick={closeBento}'));assert.ok(page.includes('min-height:44px!important'));
 const headerStart=page.indexOf('<div className="panelHeader conductRosterHeader">'),headerEnd=page.indexOf('<TeacherOfflineSettings',headerStart);
 const Header=await compile('export default function View(){return ('+page.slice(headerStart,headerEnd).trim()+');}',{selectedYear:{label:'2026-2027'},selectedClass:{name:'Sample Section'},classBack(){},loadData(){},loadingData:false});
 const header=renderToStaticMarkup(React.createElement(Header));assert.ok(header.includes('School Year 2026-2027'));assert.ok(header.includes('Section: Sample Section'));assert.ok(!header.includes('Back to sections'));assert.ok(header.includes('Refresh enrolled learners'));assert.ok(!page.includes('rosterBackRow'));
 assert.ok(page.includes('grid-template-columns:44px minmax(0,1fr) 44px'));assert.ok(page.includes('.conductRosterHeading{text-align:center;overflow-wrap:anywhere}'));
 console.log('PASS roster renders a sticky identity and three distinct period columns, preserves Start and View, selects the latest saved results and distinguishes missing or unscored evidence');
})().catch(e=>{console.error(e);process.exitCode=1});
