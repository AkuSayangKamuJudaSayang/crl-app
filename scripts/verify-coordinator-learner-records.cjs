const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {transform}=require('next/dist/build/swc');
const {Prisma}=require('@prisma/client');
(async()=>{
 const src=fs.readFileSync('lib/coordinatorAdmin.js','utf8');
 const models=new Map(Prisma.dmmf.datamodel.models.map(row=>[row.name,row]));
 function check(modelName,args){
  const model=models.get(modelName);assert.ok(model,'Unknown Prisma model '+modelName);
  for(const name of ['select','include']){
   for(const [field,value] of Object.entries(args?.[name]||{})){
    if(value===false)continue;
    if(field==='_count'){for(const item of Object.keys(value.select||{}))assert.ok(model.fields.find(f=>f.name===item&&f.kind==='object'&&f.isList));continue;}
    const f=model.fields.find(f=>f.name===field);
    assert.ok(f,modelName+'.'+name+'.'+field+' must exist');
    if(name==='include')assert.equal(f.kind,'object',modelName+'.include.'+field+' must be a relation');
    if(f.kind==='object'&&value&&typeof value==='object')check(f.type,value);
   }
  }
 }
 const sectionId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const schoolId='123456',admin={id:80,role:'reading_coordinator',schoolId};
 const date=new Date('2026-11-08T00:00:00Z');
 const captures=[];
 const withCheck=(model,args,value)=>{captures.push({model,args});check(model,args);return value;};
 const session={id:30,assessmentPeriod:'BoSY',isCompleted:true,dateAdministered:date,overallClassification:'Developing Reader',sessionMetrics:{task1Score:9,task2Score:8,totalMiscues:3,miscueAccuracy:97,comprehensionScore:4,timerSeconds:100,classificationLabel:'Developing Reader'}};
 const original={id:4,lrn:'123456789012',lastName:'Test',firstName:'Pupil',middleName:null,suffix:null,sex:'Female',teacher:{fullName:'Synthetic Teacher'},assessmentSessions:[session]};
 const detail={...original,assessmentSessions:[{...session,letterResults:[{id:1,letter:'A',letterIndex:0,isCorrect:true}],wordResults:[{id:2,word:'cat',wordIndex:0,isCorrect:true}],passageMiscues:[{id:3,wordIndex:4,miscueType:'OMISSION',misreadWord:null}],comprehensionResults:[{id:4,questionIndex:0,isCorrect:false}],hostSessions:[{storyTitle:'Synthetic Story'}]}]};
 const prisma={
  schoolYearSectionInsertion:{findFirst:async args=>withCheck('SchoolYearSectionInsertion',args,{schoolSection:{name:'Jupiter'},id:'insert'})},
  classSection:{findMany:async args=>withCheck('ClassSection',args,[{id:sectionId}])},
  learner:{
   findMany:async args=>withCheck('Learner',args,[original]),
   findFirst:async args=>withCheck('Learner',args,detail)
  }
 };
 const noop=()=>null;
 const stubs={
  './schoolAssignments':{schoolSetup:async()=>({years:[],sections:[]})},
  './teacherDirectory':{teacherSectionCounts:{}},
  './liveAssessments':{readLiveAssessments:noop},
  './coordinatorBackups':{listCoordinatorBackups:noop,coordinatorBackupDownload:noop,manageCoordinatorBackup:noop},
  './coordinatorRecovery':{readCoordinatorRecovery:noop},
  './coordinatorRoster':{manageCoordinatorRoster:noop},
  './prisma':{prisma},
  './classWorkspaces':{handleClassAction:noop,requireClass:noop,classCatalog:noop},
  './classWorkspace.mjs':{CLASS_ACTIONS:new Set(),workspaceError:(message,status=400)=>Object.assign(new Error(message),{status})},
  './coordinatorPolicy':{sharedLibrary:noop,publishLibrary:noop,defaultLibraryBody:noop,libraryEditStatus:noop},
  './adminHistory':{learnerHistoryInclude:{}}
 };
 const js=(await transform(src,{filename:'lib/coordinatorAdmin.js',jsc:{parser:{syntax:'ecmascript'}},module:{type:'commonjs'}})).code;
 const module={exports:{}};
 vm.runInNewContext(js,{module,exports:module.exports,require:name=>stubs[name]||require(name),console,Date,Number,String,Object,Set,Error},{filename:'lib/coordinatorAdmin.js'});
 const get=module.exports.coordinatorGet;
 const q=values=>new URLSearchParams(values);
 const query=q({start_year:'2026',section_id:sectionId});
 const rows=await get('coordinator_learner_records',query,admin);
 assert.equal(rows.section,'Jupiter');
 assert.equal(rows.learners.length,1);
 assert.equal(rows.learners[0].teacherName,'Synthetic Teacher');
 assert.equal(rows.learners[0].assessments[0].sessionMetrics.task1Score,9);
 assert.equal(rows.learners[0].assessments[0].sessionMetrics.miscueAccuracy,97);
 const detailResult=await get('coordinator_learner_result',q({start_year:'2026',section_id:sectionId,learner_id:'4'}),admin);
 assert.equal(detailResult.learner.assessmentSessions[0].letterResults[0].letter,'A');
 assert.equal(detailResult.learner.assessmentSessions[0].wordResults[0].word,'cat');
 assert.equal(detailResult.learner.assessmentSessions[0].passageMiscues[0].wordIndex,4);
 assert.equal(detailResult.learner.assessmentSessions[0].comprehensionResults[0].isCorrect,false);
 assert.equal(detailResult.learner.assessmentSessions[0].storyTitle,'Synthetic Story');
 assert.ok(captures.every(x=>!x.args?.where?.schoolId||x.args.where.schoolId===schoolId),'All school IDs must be scoped');
 const insertion=captures.find(x=>x.model==='SchoolYearSectionInsertion');
 assert.equal(insertion.args.where.schoolId,schoolId);
 assert.equal(insertion.args.where.removedAt,null);
 assert.equal(insertion.args.where.globalSchoolYear.deletedAt,null);
 assert.equal(insertion.args.where.schoolSection.deletedAt,null);
 const lookup=captures.find(x=>x.model==='Learner'&&x.args.where.classSection);
 assert.equal(lookup.args.where.classSection.teacher.schoolId,schoolId);
 assert.equal(lookup.args.where.classSection.schoolYear.deletedAt,null);
 assert.equal(lookup.args.select.assessmentSessions.where.isCompleted,true,'Never expose unfinished assessment evidence');
 const list=captures.find(x=>x.model==='Learner'&&x.args.where.classSectionId);
 assert.equal(list.args.where.teacher.schoolId,schoolId);
 assert.equal(list.args.select.assessmentSessions.where.isCompleted,true);
 for(const bad of [{start_year:'2026',section_id:'bad'},{start_year:'x',section_id:sectionId}]){
  await assert.rejects(()=>get('coordinator_learner_records',q(bad),admin),error=>error.status===400);
 }
 await assert.rejects(()=>get('coordinator_learner_result',q({start_year:'2026',section_id:sectionId,learner_id:'bad'}),admin),error=>error.status===400);
 const consoleUI=fs.readFileSync('components/CoordinatorConsole.jsx','utf8');
 const recordsUI=fs.readFileSync('components/CoordinatorLearnerRecords.jsx','utf8');
 const scheduleUI=fs.readFileSync('components/SchoolAssessmentActivation.jsx','utf8');
 const server=fs.readFileSync('lib/schoolAssignments.js','utf8');
 assert.ok(consoleUI.includes('<CoordinatorLearnerRecords api={api} refreshKey={refresh}/>'));
 assert.ok(!consoleUI.includes('Teacher records'),'Remove teacher-first records UI');
 assert.ok(recordsUI.includes('Select a school year and section'),'Unselected state gives a clear prompt');
 for(const label of ['School year','Section','Search learner name or LRN','Filter by sex','Filter by assessment timeline','Filter by assessment status','Sort learner records','Individual assessment results','Letter-sound responses','Word-reading responses','Passage-reading miscues','Comprehension answers'])assert.ok(recordsUI.includes(label),'Missing read-only records field '+label);
 assert.ok(!/api\('coordinator_(?:roster|class_action)'/.test(recordsUI),'Records UI must not call a mutation');
 assert.ok(scheduleUI.includes('disabled={!year||busy||live}'),'Live timeline disables Edit schedule');
 assert.ok(scheduleUI.includes('Are you sure you want to clear this schedule?'),'Clear confirmation must be one short sentence');
 assert.ok(server.includes("if(old&&scheduleIsLive(old))throw workspaceError('Stop this timeline before editing or clearing its schedule.',409)"),'Server must reject edits and clears of live timelines');
 console.log('PASS coordinator Learner Records: valid per-school/year/section access, generated Prisma selection, complete assessment detail, inactive result exclusion, read-only UI, filters and live schedule edit lock.');
})().catch(error=>{console.error(error);process.exitCode=1;});
