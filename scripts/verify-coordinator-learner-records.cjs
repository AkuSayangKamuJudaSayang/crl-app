const assert=require('node:assert/strict');
const fs=require('fs');
const vm=require('vm');
const {transform}=require('next/dist/build/swc');
const {Prisma}=require('@prisma/client');

(async()=>{
 const models=new Map(Prisma.dmmf.datamodel.models.map(m=>[m.name,m]));
 const modelField=(name,field)=>models.get(name)?.fields.find(f=>f.name===field);
 function validateSelect(modelName,args,path=modelName){
  assert.ok(models.has(modelName),'Prisma model '+modelName);
  for(const kind of ['select','include']){
   if(!args?.[kind])continue;
   for(const [name,value] of Object.entries(args[kind])){
    if(value===false)continue;
    const field=modelField(modelName,name);
    assert.ok(field,path+'.'+kind+'.'+name+' must exist');
    if(kind==='include')assert.equal(field.kind,'object','Cannot include scalar '+name);
    if(value&&typeof value==='object'&&field.kind==='object')validateSelect(field.type,value,path+'.'+name);
   }
  }
 }
 const schoolId='123456',differentSchool='654321',year=2026,
 sectionId='11111111-1111-4111-8111-111111111111',classId='22222222-2222-4222-8222-222222222222';
 const periodRows=[
  {id:101,assessmentPeriod:'BoSY',dateAdministered:new Date('2026-07-10T00:00:00Z'),isCompleted:true,overallClassification:'Developing Reader',sessionMetrics:{task1Score:8,task2Score:7,totalMiscues:3,miscueAccuracy:97,comprehensionScore:4,timerSeconds:89}},
  {id:102,assessmentPeriod:'MoSY',dateAdministered:new Date('2026-11-10T00:00:00Z'),isCompleted:false,overallClassification:null,sessionMetrics:null}
 ];
 const detailRows=periodRows.map(s=>({...s,letterResults:[{id:1,letterIndex:0,letter:'b',isCorrect:true}],wordResults:[{id:2,wordIndex:0,word:'book',isCorrect:false}],
  passageMiscues:[{id:3,wordIndex:9,miscueType:'SUBSTITUTION',misreadWord:'cat'}],comprehensionResults:[{id:4,questionIndex:0,isCorrect:true}],hostSessions:[{storyTitle:'Synthetic test story'}]}));
 let readCalls=[],writes=0,inserted=true,subjectSchool=schoolId;
 const db={
  globalSchoolYear:{findMany:async q=>{readCalls.push(['years',q]);validateSelect('GlobalSchoolYear',q);
   assert.equal(q.where.schoolId,subjectSchool);return [{startYear:2026,label:'2026-2027'}];}},
  schoolYearSectionInsertion:{
   findMany:async q=>{readCalls.push(['insertions',q]);validateSelect('SchoolYearSectionInsertion',q);assert.equal(q.where.schoolId,subjectSchool);return [{startYear:year,schoolSectionId:sectionId,schoolSection:{name:'Jupiter'}}];},
   findFirst:async q=>{readCalls.push(['insertion',q]);validateSelect('SchoolYearSectionInsertion',q);assert.equal(q.where.schoolId,subjectSchool);
    return inserted&&subjectSchool===schoolId&&q.where.startYear===year&&q.where.schoolSectionId===sectionId?{schoolSection:{name:'Jupiter'},globalSchoolYear:{label:'2026-2027'}}:null;}
  },
  classSection:{findMany:async q=>{readCalls.push(['classes',q]);validateSelect('ClassSection',q);assert.equal(q.where.schoolYear.schoolId,subjectSchool);
   assert.equal(q.where.schoolYear.startYear,year);
   return [{id:classId,teacherId:5,unassignedAt:new Date(),teacher:{fullName:'Synthetic Teacher'}}];}},
  learner:{
   findMany:async q=>{readCalls.push(['learners',q]);validateSelect('Learner',q);
    assert.deepEqual(Array.from(q.where.classSectionId.in),[classId]);
    return [{id:88,lrn:'123456789012',firstName:'Read',middleName:'Q',lastName:'Only',suffix:null,sex:'Female',classSectionId:classId,assessmentSessions:periodRows}];},
   findFirst:async q=>{readCalls.push(['detail',q]);assert.deepEqual(Array.from(q.where.classSectionId.in),[classId]);return q.where.id===88?{
    id:88,lrn:'123456789012',firstName:'Read',middleName:'Q',lastName:'Only',suffix:null,sex:'Female',classSectionId:classId,assessmentSessions:detailRows
   }:null;}
  }
 };
 const content=fs.readFileSync('lib/coordinatorLearnerRecords.js','utf8');
 const transformed=await transform(content,{filename:'lib/coordinatorLearnerRecords.js',jsc:{parser:{syntax:'ecmascript'}},module:{type:'commonjs'}});
 const module={exports:{}};
 vm.runInNewContext(transformed.code,{module,exports:module.exports,require:name=>({
  './prisma':{prisma:db},
  './adminHistory':{learnerHistoryInclude:{assessmentSessions:{include:{letterResults:true,wordResults:true,passageMiscues:true,comprehensionResults:true,sessionMetrics:true,hostSessions:true}}}},
  './classWorkspace.mjs':{workspaceError:(message,status=400)=>Object.assign(new Error(message),{status})}
 })[name]||require(name),Date,Number,Error,Intl,Set,console},{filename:'lib/coordinatorLearnerRecords.js'});
 const api=module.exports.coordinatorLearnerRecords,actor={role:'reading_coordinator',schoolId};
 const q=(params={})=>({get:key=>params[key]??null});
 const catalog=await api('coordinator_learner_record_catalog',q(),actor,db);
 assert.equal(catalog.years.length,1);assert.equal(catalog.sections[0].name,'Jupiter');
 let query=q({start_year:String(year),school_section_id:sectionId,learner_id:'88'});
 const list=await api('coordinator_learner_record_list',query,actor,db);
 assert.equal(list.learners.length,1);
 assert.equal(list.classes.length,1,'Read-only original teacher Excel export is preserved');
 assert.equal(list.classes[0].classSectionId,classId);
 assert.equal(list.classes[0].teacherId,5);assert.equal(list.learners[0].assessments[0].metrics.task1Score,8);
 assert.equal(list.learners[0].unassigned,true,'An unassigned class retains its learners and scores');
 assert.equal(list.learners[0].teacherName,'Synthetic Teacher');
 assert.equal(list.learners[0].lrn,'123456789012');
 assert.equal(list.learners[0].assessments.length,2);
 assert.equal(Object.hasOwn(list.learners[0].assessments[0],'letters'),false,'List does not bulk-download detailed answers');
 const detail=await api('coordinator_learner_record_detail',query,actor,db);
 assert.equal(detail.learner.assessments[0].letters[0].letter,'b');
 assert.equal(detail.learner.assessments[0].words[0].word,'book');
 assert.equal(detail.learner.assessments[0].miscues[0].miscueType,'SUBSTITUTION');
 assert.equal(detail.learner.assessments[0].comprehension[0].isCorrect,true);
 assert.equal(detail.learner.assessments[0].storyTitle,'Synthetic test story');
 assert.equal(detail.learner.assessments[0].metrics.totalMiscues,3);
 assert.equal(detail.learner.assessments[1].completed,false);
 assert.equal(await api('coordinator_learner_record_detail',q({start_year:year,school_section_id:sectionId,learner_id:'99'}),actor,db).then(()=>false,()=>true),true,'Wrong learner is not returned');
 inserted=false;
 await assert.rejects(()=>api('coordinator_learner_record_list',query,actor,db),e=>e.status===404);
 inserted=true;
 for(const v of ['1','2026junk','2021.1','2026.2'])await assert.rejects(()=>api('coordinator_learner_record_list',q({start_year:v,school_section_id:sectionId}),actor,db),e=>e.status===400);
 await assert.rejects(()=>api('coordinator_learner_record_list',q({start_year:year,school_section_id:'wrong'}),actor,db),e=>e.status===400);
 await assert.rejects(()=>api('coordinator_learner_record_list',query,{role:'teacher',schoolId},db),e=>e.status===403);
 subjectSchool=differentSchool;
 await assert.rejects(()=>api('coordinator_learner_record_list',query,{role:'reading_coordinator',schoolId:differentSchool},db),e=>e.status===404);
 assert.equal(writes,0,'Read-only API never mutates learner or assessment records');
 const ui=fs.readFileSync('components/CoordinatorLearnerRecords.jsx','utf8');
 const dashboard=fs.readFileSync('components/CoordinatorConsole.jsx','utf8');
 const server=fs.readFileSync('lib/schoolAssignments.js','utf8');
 const timeline=fs.readFileSync('components/SchoolAssessmentActivation.jsx','utf8');
 assert.ok(dashboard.includes("<CoordinatorLearnerRecords api={api} refreshKey={refresh} />"),'Records uses school/year/section flow');
 assert.ok(!dashboard.includes('Teacher records'),'Teacher-first Records UI is gone');
 assert.ok(ui.includes('Select a school year and section'));
 assert.ok(ui.includes('printAssessmentElement(workbookContent.current'),'Existing print workflow must be preserved');
 assert.ok(ui.includes('const timedReading=metrics?.timerSeconds!==null&&metrics?.timerSeconds!==undefined;'),'Unadministered passages cannot display default accuracy as measured');
 assert.ok(ui.includes('!timedReading||metrics?.miscueAccuracy==null?null'),'No timer means reading accuracy is not recorded');
 assert.ok(ui.includes('!comprehensionRecorded||metrics?.comprehensionScore==null?null'),'Unadministered comprehension cannot display a synthetic zero score');
 assert.ok(ui.includes('/api/reports/excel?teacher_id='),'Existing role-scoped Excel export must remain available');
 assert.ok(ui.includes("coordinator_learner_record_catalog"));
 assert.ok(ui.includes("coordinator_learner_record_list"));
 assert.ok(ui.includes("coordinator_learner_record_detail"));
 for(const item of ['BoSY','MoSY','EoSY','Letter-sound responses','Word-reading responses','Passage miscues','Comprehension responses','Reading accuracy','Reading time','View','Scoresheet','Class Summary','Class Record','Print','Export Excel'])assert.ok(ui.includes(item),'Missing read-only learner feature: '+item);
 for(const forbidden of ['Add Learner','Delete Selected','Import learners','Start Assessment'])assert.ok(!ui.includes(forbidden),'Mutating control in read-only Records: '+forbidden);
 assert.ok(timeline.includes("disabled={!year||busy||live}"),'Live timelines cannot open scheduling UI');
 assert.ok(timeline.includes("Are you sure you want to clear this schedule?"),'Secondary confirmation is one short sentence');
 assert.ok(server.includes("if(old&&scheduleIsLive(old))throw workspaceError('Stop this live timeline before editing or clearing its schedule.',409)"),'Server must reject live edit and clear attempts');
 console.log('PASS coordinator Learner Records: school-year/section authorization, scoped role, private details on demand, real letter/word/comprehension/miscue payloads, inactive historical classes, read-only workbook UI, and live-schedule lock.');
})().catch(err=>{console.error(err);process.exitCode=1;});
