const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const React=require('react'),{renderToStaticMarkup:render}=require('react-dom/server'),load=require('./load-ui-component.cjs');
(async()=>{
 const shared=await import('../lib/classWorkspace.mjs'),comparison=await import('../lib/coordinatorResultView.mjs');
 const {ClassPrintPages,CLASS_RECORD_PRINT_CSS}=await load('components/RecordsPrintDialog.jsx');
 const printDialogSource=fs.readFileSync('components/RecordsPrintDialog.jsx','utf8'),printDialogCss=fs.readFileSync('components/RecordsPrintDialog.module.css','utf8');
 const {PRINT_TIMELINES}=await load('components/RecordsPrintDialog.jsx');
 assert.deepEqual(JSON.parse(JSON.stringify(PRINT_TIMELINES)),[['BoSY','Beginning of School Year'],['MoSY','Middle of School Year'],['EoSY','End of School Year']]);
 assert.ok(printDialogSource.includes('>{value} - {meaning}</option>'));
 assert.ok(printDialogSource.includes('onClick={print}>Print</button>'));assert.ok(!printDialogSource.includes('>Print {period}</button>'));
 assert.ok(printDialogCss.includes('.actions button:last-child{background:#2678b9;border-color:#2678b9;color:#fff}'));
 const learners=[{id:1,first_name:'Sample',last_name:'Pupil',sex:'Female',lrn:'000000000001'}];
 const assessments=['BoSY','MoSY','EoSY'].map((period,index)=>({id:index+1,learner_id:1,assessment_period:period,is_completed:true,task1_score:10,task2_score:10,comprehension_score:4,overall_classification:'Developing Reader',remarks:period+' saved note',date_administered:'2026-11-16'}));
 const scope={learners,assessments,selectedClass:{name:'Sample Section'},user:{full_name:'Sample Teacher',school_name:'Sample School',school_id:'123456'},yearLabel:'2026-2027'};
 for(const period of ['BoSY','MoSY','EoSY'])for(const choice of ['scoresheet','class-record','summary','all']){
  const html=render(React.createElement(ClassPrintPages,{...scope,period,choice}));
  assert.equal((html.match(/data-print-period=/g)||[]).length,choice==='all'?3:1);
  assert.ok(html.includes('data-print-period="'+period+'"'));
  for(const other of ['BoSY','MoSY','EoSY'].filter(row=>row!==period)){assert.ok(!html.includes(other+' saved note'));assert.ok(!html.includes('data-print-period="'+other+'"'));}
  assert.ok(html.includes('Sample Teacher')&&html.includes('2026-2027'));
  assert.ok(!html.includes('<input')&&!html.includes('Edit Remarks')&&!html.includes('>View</button>'));
  if(choice==='scoresheet'||choice==='class-record'||choice==='all')assert.ok(html.includes(period+' saved note'));
 }
 const empty=render(React.createElement(ClassPrintPages,{...scope,assessments:[],period:'MoSY',choice:'all'}));assert.equal((empty.match(/data-print-view=/g)||[]).length,3);assert.ok(!empty.includes(' saved note'));
 const long=render(React.createElement(ClassPrintPages,{...scope,learners:Array.from({length:90},(_,i)=>({...learners[0],id:i+1,last_name:'Sample '+i})),period:'BoSY',choice:'all'}));assert.ok(long.includes('Sample 89'));
 assert.ok(CLASS_RECORD_PRINT_CSS.includes('break-before:page'));assert.ok(CLASS_RECORD_PRINT_CSS.includes('margin:0'));assert.ok(CLASS_RECORD_PRINT_CSS.includes('.scoresheetGrid col:nth-child(21)'));assert.ok(CLASS_RECORD_PRINT_CSS.includes('.classRecordTable col:nth-child(11)'));
 const teacher=fs.readFileSync('app/teacher/page.jsx','utf8'),coordinator=fs.readFileSync('components/CoordinatorRecords.jsx','utf8');assert.ok(teacher.includes('<RecordsPrintDialog scope={recordsPrintScope}'));assert.ok(coordinator.includes('<RecordsPrintDialog scope={printScope}'));assert.ok(teacher.includes('disabled={scoresheetDirty||!learnersLoaded}'));
 console.log('PASS actual shared print pages: every timeline/report/all combination, saved remarks only, read-only renderer, empty timelines, full 90-person roster, paper widths, page boundaries and both role entry points');

 const school='123456',sectionA=crypto.randomUUID(),sectionB=crypto.randomUUID(),foreign=crypto.randomUUID();let emptyDirectory=false,latestQuery;
 const session=(id,period,label)=>({id,assessmentPeriod:period,isCompleted:true,dateAdministered:'2026-11-16',overallClassification:label,sessionMetrics:{task1Score:9,task2Score:9}});
 const rows=[{id:1,classSectionId:sectionA,assessmentSessions:[session(1,'BoSY','Low Emerging Reader'),session(2,'MoSY','Developing Reader')]},{id:2,classSectionId:sectionB,assessmentSessions:[session(3,'BoSY','High Emerging Reader'),session(4,'MoSY','Reading At Grade Level')]}];
 const prisma={globalSchoolYear:{findFirst:async q=>q.where.startYear===2026&&q.where.schoolId===school?{startYear:2026,label:'2026-2027'}:null},schoolYearSectionInsertion:{findMany:async q=>{assert.equal(q.where.schoolId,school);assert.equal(q.where.globalSchoolYear.deletedAt,null);return emptyDirectory?[]:[{schoolSection:{id:sectionA,name:'Sample A',classes:[{unassignedAt:null,teacher:{fullName:'Teacher A'},_count:{learners:1}}]}},{schoolSection:{id:sectionB,name:'Sample B',classes:[{unassignedAt:null,teacher:{fullName:'Teacher B'},_count:{learners:1}}]}}];}},classSection:{findMany:async q=>{assert.equal(q.where.teacher.schoolId,school);assert.equal(q.where.schoolYear.startYear,2026);return q.where.schoolSectionId.in.map(id=>({id}));}},learner:{findMany:async q=>{latestQuery=q;assert.equal(q.where.teacher.schoolId,school);assert.equal(q.select.assessmentSessions.where.isCompleted,true);return rows.filter(row=>q.where.classSectionId.in.includes(row.classSectionId));}}};
 const ctx=vm.createContext({prisma,...shared,Date,Number,Set,Map});vm.runInContext(fs.readFileSync('lib/coordinatorAdmin.js','utf8').replace(/^import .*;\s*/gm,'').replace(/^export /gm,''),ctx);
 const api=(year,section)=>ctx.coordinatorGet('coordinator_analytics',new URLSearchParams({start_year:year,section_id:section}),{schoolId:school,role:'reading_coordinator'});
 const combined=await api('2026','all');assert.equal(combined.learners.length,2);assert.equal(combined.section,'All sections');assert.equal(combined.assignedTeacherName,'Teacher A, Teacher B');assert.equal(latestQuery.where.classSectionId.in.length,2);
 const periods=comparison.coordinatorAnalyticsPeriods(combined.learners);assert.deepEqual(periods.map(p=>p.total),[2,2,0]);assert.equal(periods[1].profiles[2].count,1);assert.equal(periods[1].profiles[4].count,1);
 assert.equal((await api('2026',sectionA)).learners.length,1);await assert.rejects(()=>api('2026',foreign),e=>e.status===404);await assert.rejects(()=>api('2027','all'),e=>e.status===404);await assert.rejects(()=>api('bad','all'),e=>e.status===400);emptyDirectory=true;assert.equal((await api('2026','all')).learners.length,0);
 const chartCss=require('postcss').parse(fs.readFileSync('components/AssessmentResults.css','utf8')),geometry={};chartCss.walkRules(rule=>{if(rule.selector===':is(.analyticsRedesign,.sharedAssessmentResults) .analyticsBarButton')for(const d of rule.nodes)geometry[d.prop]=d.value;if(rule.selector===':is(.analyticsRedesign,.sharedAssessmentResults) .analytics2dBar')for(const d of rule.nodes)geometry['bar-'+d.prop]=d.value;});assert.equal(geometry.padding,'0');assert.equal(geometry.border,'0');assert.equal(geometry.background,'transparent');assert.equal(geometry['min-height'],'0');assert.equal(geometry['bar-position'],'absolute');assert.equal(geometry['bar-bottom'],'0');
 const analyticsSource=fs.readFileSync('components/CoordinatorAnalytics.jsx','utf8');assert.ok(analyticsSource.includes('<option value="all">All sections</option>'));assert.ok(analyticsSource.includes('<ReadingProfileProgressChart'));assert.ok(analyticsSource.includes('singleGraph={section===\'all\'}'));
 console.log('PASS real coordinator analytics handler: all/single/empty sections, complete completed-only rosters, assigned teachers, accurate period denominators, foreign/deleted/invalid scope rejection and shared baseline geometry');
})().catch(e=>{console.error(e);process.exitCode=1;});
