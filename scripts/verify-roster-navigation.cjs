const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
(async()=>{
 const names=await import('../lib/learnerNames.mjs');for(const v of [null,'','N/A','NA','NONE','—'])assert.equal(names.learnerMiddleInitial({middle_name:v}),'—');for(const v of ['Marie','M.','M'])assert.equal(names.learnerMiddleInitial({middle_name:v}),'M.');assert.equal(names.learnerMiddleInitial({middleName:'Ñora'}),'Ñ.');
 const page=fs.readFileSync('app/teacher/page.jsx','utf8').replace(/\r\n/g,'\n'),swc=require('next/dist/build/swc');
 const compile=async(src,vars)=>{const c=await swc.transform(src,{filename:'view.jsx',jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'automatic'}}},module:{type:'commonjs'}});const ctx={module:{exports:{}},exports:{},require,...vars};ctx.exports=ctx.module.exports;vm.runInNewContext(c.code,ctx);return ctx.module.exports.default;};
 const start=page.indexOf('<div className="tableWrap learnerRoster"'),end=page.indexOf('</table>',start)+8;
 const periodModel=await import('../lib/learnerPeriodResults.mjs');
 const records=await import('../lib/recordViewModel.mjs');
 const results=[
  {id:4,learner_id:1,assessment_period:'BoSY',is_completed:true,task1_score:2,task2_score:3},
  {id:10,learner_id:1,assessment_period:'BoSY',is_completed:false,date_administered:'2026-11-05'},
  {id:5,learner_id:1,assessment_period:'MoSY',is_completed:true,date_administered:'2026-11-15',task1_score:9,task2_score:9,overall_classification:'Developing Reader'},
  {id:6,learner_id:1,assessment_period:'MoSY',is_completed:true,date_administered:'2026-11-15',task1_score:9,task2_score:9,overall_classification:'Reading At Grade Level',offline_pending:true},
  {id:7,learner_id:2,assessment_period:'EoSY',is_completed:false},
 ];
 const byLearner=periodModel.latestLearnerPeriodResults(results);
 const props={...periodModel,...records,learnerPeriodResults:byLearner,PERIODS:['BoSY','MoSY','EoSY'],periodEligibility:(await import('../lib/classWorkspace.mjs')).periodEligibility,selectedClass:{id:'s',schoolYearId:'y'},setAnalyticsYearId(){},setAnalyticsSectionId(){},selectAnalyticsLearner(){},setAnalyticsMobileResultOpen(){},filteredLearners:[{id:1,lrn:'000000000001',last_name:'SAMPLE',first_name:'LEARNER',middle_name:'M.',suffix:'Jr.',sex:'Female'},{id:2,lrn:'000000000002',lastName:'TEST',firstName:'SECOND',sex:'Male'}],assessments:results,selectedLearnerIds:[1],classReadonly:false,startingAssessment:false,liveTimelineIssue:()=>'',toggleLearnerSelection(){},selectAllFilteredLearners(){},clearLearnerSelection(){}};
 const Roster=await compile('export default function View(){return ('+page.slice(start,end)+'</div>);}',props);
 const html=renderToStaticMarkup(React.createElement(Roster));
 assert.equal((html.match(/scope="col"/g)||[]).length,4);
 assert.equal((html.match(/scope="row"/g)||[]).length,2);
 assert.equal((html.match(/<td[ >]/g)||[]).length,6);
 for(const label of ['LRN','BoSY','MoSY','EoSY','M. Jr.','Female','TEST, SECOND','>Start<','>View<','Select all visible learners','Low Emerging Reader','Reading At Grade Level','Completed · Sync pending','Incomplete','Not yet assessed'])assert.ok(html.includes(label),label);
 assert.ok(!html.includes('Developing Reader'));
 assert.ok(!html.includes('Delete'));
 assert.match(page,/\.learnerRoster \.rosterIdentity \{ position:sticky; left:0;/);
 assert.equal(periodModel.countLearnerMiscues({}),null);
 assert.equal(periodModel.countLearnerMiscues({passage_miscues:[]}).size,0);
 const miscues=periodModel.countLearnerMiscues({passage_miscues:[{miscue_type:'Last Word Read'},{miscue_type:'SelfCorrection'},{miscueType:'Self-correction'},{type:'Omission'}]});
 assert.equal(miscues.get('selfcorrection'),2);
 assert.equal(miscues.get('omission'),1);
 assert.equal(miscues.size,2);
 const shared=fs.readFileSync('components/SharedAssessmentResults.jsx','utf8');
 const Summary=await compile(shared.slice(shared.indexOf('function LearnerComparisonTable'),shared.indexOf('export function AnalyticsLearnerResultPanel'))+'export default LearnerPeriodSummary;',{
  ...periodModel,...records,PERIODS:['BoSY','MoSY','EoSY'],ANALYTICS_MISCUE_PALETTE:{Omission:[],Substitution:[]},
 });
 const summary=renderToStaticMarkup(React.createElement(Summary,{periodResults:[
  {period:'BoSY',result:{is_completed:true,task1_score:0,task2_score:0,timer_seconds:null}},
  {period:'MoSY',result:{is_completed:true,task1_score:9,task2_score:9,timer_seconds:60,words_read:95,comprehension_score:5,miscue_accuracy:95,total_miscues:5},detail:{passage_miscues:[{miscue_type:'Omission'},{miscue_type:'Last Word Read'}]}},
  {period:'EoSY',result:{is_completed:true,task1_score:9,task2_score:9,timer_seconds:120,words_read:80,comprehension_score:4,miscue_accuracy:80,total_miscues:20}},
 ]}));
 for(const label of ['Reading performance by period','Miscues by type','95.00','40.00','Not administered','Details unavailable'])assert.ok(summary.includes(label),label);
 assert.match(summary,/>Omission<\/th><td>Not administered<\/td><td>1<\/td><td>Details unavailable<\/td>/);
 assert.match(summary,/>Substitution<\/th><td>Not administered<\/td><td>0<\/td><td>Details unavailable<\/td>/);
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
