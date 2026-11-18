import {selectAssessmentContentForRun} from './assessmentContent';
import {serializeAssessmentContent,serializeAssessmentContentMode,serializeAssessmentContentDefaults} from './contentCatalog';
import {getStoryQuestions} from './storyComprehension.mjs';
import {schoolSetup,manageSchoolAssessment} from './schoolAssignments';
import {teacherSectionCounts} from './teacherDirectory';
import {prisma} from './prisma';
import {requireClass,classCatalog} from './classWorkspaces';
import {workspaceError} from './classWorkspace.mjs';
import {sharedLibrary,publishLibrary,defaultLibraryBody,libraryEditStatus} from './coordinatorPolicy';
import {learnerHistoryInclude} from './adminHistory';
const PERIODS=['BoSY','MoSY','EoSY'];
async function teacher(id){const row=await prisma.user.findFirst({where:{id:Number(id)||0,role:'teacher'},select:{id:true,fullName:true,schoolName:true,schoolId:true,learnerDataVersion:true}});if(!row)throw workspaceError('Choose a valid teacher.',404);return row;}
async function recordStoryNumber(session,teacherId,cache){
 const host=session.hostSessions?.[0],title=String(host?.storyTitle||'').trim().toLowerCase();
 if(title==='para the parrot')return 1;if(title==='a day in the fields')return 2;
 if(!title||!host?.code)return null;
 try{
  const key=host.catalogRevisionId||`${teacherId}:${session.assessmentPeriod}`;
  if(!cache.has(key))cache.set(key,host.catalogRevisionId?prisma.assessmentLibraryRevision.findUnique({where:{id:host.catalogRevisionId}}):prisma.assessmentContent.findMany({where:{teacherId,assessmentPeriod:session.assessmentPeriod},orderBy:[{category:'asc'},{position:'asc'}]}));
  const saved=await cache.get(key);if(!saved||!Array.isArray(saved)&&saved.period!==session.assessmentPeriod)return null;
  const rows=Array.isArray(saved)?saved:saved.rows,period=session.assessmentPeriod;
  const selected=selectAssessmentContentForRun(serializeAssessmentContent(rows)[period],serializeAssessmentContentMode(rows)[period],host.code,serializeAssessmentContentDefaults(rows)[period]);
  const index=selected.stories.findIndex(story=>String(story.title||'').trim().toLowerCase()===title);return index<0?null:index+1;
 }catch{return null;}
}
export async function coordinatorGet(action,q,admin){
 if(action==='coordinator_analytics'){
  // Reuse the authorized year/section directory; one database result contains
  // the full roster rather than a client fan-out or a truncated preview.
  const startYear=Number(q.get('start_year')),sectionId=String(q.get('section_id')||'');
  const directory=await coordinatorGet('coordinator_record_sections',q,admin);
  const selected=sectionId==='all'?directory.sections:directory.sections.filter(row=>row.id===sectionId);
  if(sectionId!=='all'&&!selected.length)throw workspaceError('Choose a section in this school year.',404);
  const classes=selected.length?await prisma.classSection.findMany({where:{schoolSectionId:{in:selected.map(row=>row.id)},deletedAt:null,schoolYear:{schoolId:admin.schoolId,startYear,deletedAt:null},teacher:{schoolId:admin.schoolId}},select:{id:true}}):[];
  const learners=classes.length?await prisma.learner.findMany({where:{classSectionId:{in:classes.map(row=>row.id)},teacher:{schoolId:admin.schoolId}},select:{id:true,assessmentSessions:{where:{isCompleted:true},select:{id:true,isCompleted:true,assessmentPeriod:true,dateAdministered:true,overallClassification:true,sessionMetrics:true}}}}):[];
  const names=[...new Set(selected.map(row=>row.assignedTeacherName).filter(Boolean))];
  return {year:startYear,section:sectionId==='all'?'All sections':selected[0].name,schoolName:admin.schoolName,schoolId:admin.schoolId,assignedTeacherName:names.join(', ')||null,learners:learners.map(({assessmentSessions,...learner})=>({...learner,assessments:assessmentSessions}))};
 }
 if(action==='coordinator_record_sections'){
  const startYear=Number(q.get('start_year'));
  if(!Number.isInteger(startYear)||startYear<2000||startYear>2200)throw workspaceError('Choose a valid school year.',400);
  const year=await prisma.globalSchoolYear.findFirst({where:{schoolId:admin.schoolId,startYear,deletedAt:null},select:{startYear:true,label:true}});
  if(!year)throw workspaceError('This school year is unavailable.',404);
  const entries=await prisma.schoolYearSectionInsertion.findMany({where:{schoolId:admin.schoolId,startYear,removedAt:null,globalSchoolYear:{deletedAt:null},schoolSection:{deletedAt:null}},select:{schoolSection:{select:{id:true,name:true,classes:{where:{deletedAt:null,schoolYear:{schoolId:admin.schoolId,startYear,deletedAt:null},teacher:{schoolId:admin.schoolId}},select:{id:true,unassignedAt:true,teacher:{select:{id:true,fullName:true}},_count:{select:{learners:true}}}}}}},orderBy:{schoolSection:{name:'asc'}}});
  return {year,sections:entries.map(({schoolSection:section})=>({id:section.id,name:section.name,assignedTeacherName:section.classes.find(row=>!row.unassignedAt)?.teacher.fullName||null,learnerCount:section.classes.reduce((n,row)=>n+row._count.learners,0)}))};
 }
 if(action==='coordinator_learner_records'){
  const startYear=Number(q.get('start_year')),schoolSectionId=String(q.get('section_id')||'');
  if(!Number.isInteger(startYear)||startYear<2000||startYear>2200||!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(schoolSectionId))throw workspaceError('Choose a valid school year and section.',400);
  const inserted=await prisma.schoolYearSectionInsertion.findFirst({where:{schoolId:admin.schoolId,startYear,schoolSectionId,removedAt:null,globalSchoolYear:{deletedAt:null},schoolSection:{deletedAt:null}},select:{schoolSection:{select:{name:true}}}});
  if(!inserted)throw workspaceError('The selected section is not assigned to this school year.',404);
   const classes=await prisma.classSection.findMany({where:{schoolSectionId,deletedAt:null,schoolYear:{startYear,deletedAt:null},teacher:{schoolId:admin.schoolId}},select:{id:true,unassignedAt:true,teacher:{select:{id:true,fullName:true,schoolName:true,schoolId:true}}}});
  const ids=classes.map(row=>row.id);
  const learners=ids.length?await prisma.learner.findMany({where:{classSectionId:{in:ids},teacher:{schoolId:admin.schoolId}},orderBy:[{lastName:'asc'},{firstName:'asc'},{id:'asc'}],select:{id:true,teacherId:true,classSectionId:true,lrn:true,firstName:true,middleName:true,lastName:true,suffix:true,sex:true,assessmentSessions:{where:{isCompleted:true},select:{id:true,isCompleted:true,assessmentPeriod:true,dateAdministered:true,overallClassification:true,sessionMetrics:true,hostSessions:{select:{storyTitle:true,code:true,catalogRevisionId:true},orderBy:{updatedAt:"desc"},take:1}}}}}):[];
  const storyCache=new Map();
  for(const learner of learners)learner.assessmentSessions=await Promise.all(learner.assessmentSessions.map(async session=>({...session,storyNumber:await recordStoryNumber(session,learner.teacherId,storyCache)})));
   const assignedTeachersByClass=new Map(classes.filter(row=>!row.unassignedAt).map(row=>[row.id,row.teacher.fullName]));
   const assignedTeacherName=classes.find(row=>!row.unassignedAt)?.teacher.fullName||null;
   return {year:startYear,section:inserted.schoolSection.name,assignedTeacherName,assignedTeacher:classes.find(row=>!row.unassignedAt)?.teacher||null,schoolName:admin.schoolName||null,schoolId:admin.schoolId,learners:learners.map(({classSectionId,assessmentSessions,...learner})=>({...learner,classSectionId,teacherName:assignedTeachersByClass.get(classSectionId)||'',assessments:assessmentSessions.map(({hostSessions,...session})=>({...session,storyTitle:hostSessions?.[0]?.storyTitle||null,sessionMetrics:session.sessionMetrics?{...session.sessionMetrics,miscueAccuracy:Number(session.sessionMetrics.miscueAccuracy)}:null}))}))};
 }
 if(action==='coordinator_learner_result'){
  const startYear=Number(q.get('start_year')),schoolSectionId=String(q.get('section_id')||''),learnerId=Number(q.get('learner_id'));
  if(!Number.isInteger(startYear)||startYear<2000||startYear>2200||!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(schoolSectionId)||!Number.isSafeInteger(learnerId)||learnerId<=0)throw workspaceError('Choose a valid learner and section.',400);
  const inserted=await prisma.schoolYearSectionInsertion.findFirst({where:{schoolId:admin.schoolId,startYear,schoolSectionId,removedAt:null,globalSchoolYear:{deletedAt:null},schoolSection:{deletedAt:null}},select:{id:true}});
  if(!inserted)throw workspaceError('The selected section is not assigned to this school year.',404);
  const learner=await prisma.learner.findFirst({where:{id:learnerId,classSection:{schoolSectionId,deletedAt:null,schoolYear:{startYear,deletedAt:null},teacher:{schoolId:admin.schoolId}}},select:{id:true,classSectionId:true,classSection:{select:{id:true,teacherId:true,schoolYearId:true,name:true,unassignedAt:true,schoolYear:{select:{id:true,label:true,startYear:true}},teacher:{select:{id:true,fullName:true,schoolName:true,schoolId:true}}}},lrn:true,firstName:true,middleName:true,lastName:true,suffix:true,sex:true,assessmentSessions:{where:{isCompleted:true},orderBy:[{dateAdministered:'desc'},{id:'desc'}],include:{sessionMetrics:true,letterResults:{orderBy:{letterIndex:'asc'}},wordResults:{orderBy:{wordIndex:'asc'}},passageMiscues:{orderBy:{wordIndex:'asc'}},comprehensionResults:{orderBy:{questionIndex:'asc'}},hostSessions:{select:{storyTitle:true,catalogRevisionId:true},orderBy:{updatedAt:'desc'},take:1}}}}});
  if(!learner)throw workspaceError('Learner record unavailable in the selected section.',404);
  const revisions=new Map();
  const sessions=await Promise.all(learner.assessmentSessions.map(async({hostSessions,sessionMetrics,...session})=>{
   const host=hostSessions[0];let story=null;
   if(host?.catalogRevisionId){try{
    if(!revisions.has(host.catalogRevisionId))revisions.set(host.catalogRevisionId,prisma.assessmentLibraryRevision.findUnique({where:{id:host.catalogRevisionId}}));
    const revision=await revisions.get(host.catalogRevisionId);
    if(revision?.period===session.assessmentPeriod)story=serializeAssessmentContent(revision.rows)[session.assessmentPeriod]?.stories?.find(item=>String(item.title).trim().toLowerCase()===String(host.storyTitle).trim().toLowerCase());
   }catch{story=null;}}
   return {...session,storyTitle:host?.storyTitle||null,storyText:story?.text||'',storyQuestions:story?getStoryQuestions(story):[],sessionMetrics:sessionMetrics?{...sessionMetrics,miscueAccuracy:Number(sessionMetrics.miscueAccuracy)}:null};
  }));
  const scope=learner.classSection;
  return {learner:{...learner,assessmentSessions:sessions},printScope:scope?{section:{id:scope.id,teacherId:scope.teacherId,schoolYearId:scope.schoolYearId,name:scope.name},year:scope.schoolYear,teacher:{id:scope.teacherId,full_name:scope.unassignedAt?'':scope.teacher.fullName,school_name:scope.teacher.schoolName,school_id:scope.teacher.schoolId}}:null};
 }
 if(action==='coordinator_setup')return schoolSetup();
 if(action==='coordinator_live_assessments')throw workspaceError('Live assessment monitoring has been removed.',410);
 if(['coordinator_backups','coordinator_backup_download'].includes(action))throw workspaceError('Backups have been retired from Archive.',410);

 if(['coordinator_recovery','coordinator_learner_view','coordinator_archive'].includes(action))throw workspaceError('Archives are managed by your school administrator.',403);
 if(action==='coordinator_teachers'){const term=String(q.get('q')||'').slice(0,100),sort=q.get('sort')==='desc'?'desc':'asc';const teachers=await prisma.user.findMany({where:{role:'teacher',...(term?{fullName:{contains:term,mode:'insensitive'}}:{})},select:{id:true,fullName:true,profilePhoto:true,...teacherSectionCounts},orderBy:[{fullName:sort},{id:'asc'}]});return {teachers,hasMore:false};}
 if(action==='coordinator_years')return {years:await prisma.globalSchoolYear.findMany({where:{deletedAt:null},orderBy:{startYear:'desc'},include:{schoolYears:{where:{deletedAt:null},select:{id:true,_count:{select:{sections:{where:{deletedAt:null}}}}}}}})};
 if(action==='coordinator_library')return {...await sharedLibrary(),...await libraryEditStatus()};
 if(action==='coordinator_library_status')return libraryEditStatus();
 if(['coordinator_windows','coordinator_requests'].includes(action))throw workspaceError('This workflow has been retired. Refresh the application.',410);
 if(action==='coordinator_learner_identity'){const owner=await teacher(q.get('teacher_id')),lrn=String(q.get('lrn')||'').trim();if(!/^\d{10,12}$/.test(lrn))throw workspaceError('Enter a valid LRN.');return {exists:Boolean(await prisma.learner.findFirst({where:{teacherId:owner.id,lrn},select:{id:true}}))};}
 if(action==='coordinator_classes'){const owner=await teacher(q.get('teacher_id'));return classCatalog(owner.id,true);}
 if(action==='coordinator_report'){const owner=await teacher(q.get('teacher_id')),section=await requireClass(prisma,owner.id,q.get('class_section_id'));const learners=await prisma.learner.findMany({where:{teacherId:owner.id,classSectionId:section.id},orderBy:[{lastName:'asc'},{firstName:'asc'}],include:learnerHistoryInclude});return {teacher:owner,year:section.schoolYear.label,section:section.name,learners:learners.map(l=>({id:l.id,lastName:l.lastName,firstName:l.firstName,middleName:l.middleName,suffix:l.suffix,name:[l.lastName+',',l.firstName,l.middleName,l.suffix].filter(Boolean).join(' '),lrn:l.lrn,sex:l.sex,assessments:l.assessmentSessions.map(s=>({id:s.id,period:s.assessmentPeriod,date:s.dateAdministered,completed:s.isCompleted,classification:s.overallClassification,storyTitle:s.hostSessions?.[0]?.storyTitle||null,remarks:s.sessionMetrics?.remarks,metrics:s.sessionMetrics,letters:s.letterResults,words:s.wordResults,comprehension:s.comprehensionResults,miscues:s.passageMiscues}))}))};}
 return null;
}
export async function coordinatorPost(action,b,admin){
 if(['coordinator_assign_section','coordinator_add_year','coordinator_delete_year'].includes(action))throw workspaceError('School years and section assignments are managed by your school administrator.',403);
 if(action==='coordinator_assessment')return manageSchoolAssessment(b,admin);
 if(action==='coordinator_backup_action')throw workspaceError('Backups have been retired from Archive.',410);
 if(action==='coordinator_roster')throw workspaceError('Learners are managed by their assigned teacher.',403);
 if(action==='coordinator_activate'||action==='coordinator_review')throw workspaceError('This workflow has been retired. Refresh the application.',410);
 if(action==='coordinator_publish')return publishLibrary(admin.id,b);
 if(action==='coordinator_initialize'){if(!PERIODS.includes(b.period))throw workspaceError('Choose a valid period.');const lib=await sharedLibrary();if(lib.catalogRevisions[b.period])throw workspaceError('This period already has published contents.',409);return publishLibrary(admin.id,{...defaultLibraryBody(b.period),expected_revision:null});}
 if(action==='coordinator_class_action')throw workspaceError('School years, sections and archives are managed by your school administrator.',403);
 return null;
}
