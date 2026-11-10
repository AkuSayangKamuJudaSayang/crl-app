import {schoolSetup,manageSchoolAssessment} from './schoolAssignments';
import {teacherSectionCounts} from './teacherDirectory';
import {readLiveAssessments} from './liveAssessments';
import {listCoordinatorBackups,coordinatorBackupDownload,manageCoordinatorBackup} from './coordinatorBackups';
import {readCoordinatorRecovery} from './coordinatorRecovery';
import {manageCoordinatorRoster} from './coordinatorRoster';
import {prisma} from './prisma';
import {handleClassAction,requireClass,classCatalog} from './classWorkspaces';
import {CLASS_ACTIONS,workspaceError} from './classWorkspace.mjs';
import {sharedLibrary,publishLibrary,defaultLibraryBody,libraryEditStatus} from './coordinatorPolicy';
import {learnerHistoryInclude} from './adminHistory';
const PERIODS=['BoSY','MoSY','EoSY'];
async function teacher(id){const row=await prisma.user.findFirst({where:{id:Number(id)||0,role:'teacher'},select:{id:true,fullName:true,schoolName:true,schoolId:true,learnerDataVersion:true}});if(!row)throw workspaceError('Choose a valid teacher.',404);return row;}
export async function coordinatorGet(action,q,admin){
 if(action==='coordinator_learner_records'){
  const startYear=Number(q.get('start_year')),schoolSectionId=String(q.get('section_id')||'');
  if(!Number.isInteger(startYear)||startYear<2000||startYear>2200||!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(schoolSectionId))throw workspaceError('Choose a valid school year and section.',400);
  const inserted=await prisma.schoolYearSectionInsertion.findFirst({where:{schoolId:admin.schoolId,startYear,schoolSectionId,removedAt:null,globalSchoolYear:{deletedAt:null},schoolSection:{deletedAt:null}},select:{schoolSection:{select:{name:true}}}});
  if(!inserted)throw workspaceError('The selected section is not assigned to this school year.',404);
  const classes=await prisma.classSection.findMany({where:{schoolSectionId,deletedAt:null,schoolYear:{startYear,deletedAt:null},teacher:{schoolId:admin.schoolId}},select:{id:true}});
  const ids=classes.map(row=>row.id);
  const learners=ids.length?await prisma.learner.findMany({where:{classSectionId:{in:ids},teacher:{schoolId:admin.schoolId}},orderBy:[{lastName:'asc'},{firstName:'asc'},{id:'asc'}],select:{id:true,lrn:true,firstName:true,middleName:true,lastName:true,suffix:true,sex:true,teacher:{select:{fullName:true}},assessmentSessions:{where:{isCompleted:true},select:{id:true,assessmentPeriod:true,dateAdministered:true,overallClassification:true,sessionMetrics:{select:{task1Score:true,task2Score:true,totalMiscues:true,miscueAccuracy:true,comprehensionScore:true,timerSeconds:true,classificationLabel:true}}}}}}):[];
  return {year:startYear,section:inserted.schoolSection.name,learners:learners.map(({teacher,assessmentSessions,...learner})=>({...learner,teacherName:teacher?.fullName||'',assessments:assessmentSessions.map(session=>({...session,sessionMetrics:session.sessionMetrics?{...session.sessionMetrics,miscueAccuracy:Number(session.sessionMetrics.miscueAccuracy)}:null}))}))};
 }
 if(action==='coordinator_learner_result'){
  const startYear=Number(q.get('start_year')),schoolSectionId=String(q.get('section_id')||''),learnerId=Number(q.get('learner_id'));
  if(!Number.isInteger(startYear)||startYear<2000||startYear>2200||!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(schoolSectionId)||!Number.isSafeInteger(learnerId)||learnerId<=0)throw workspaceError('Choose a valid learner and section.',400);
  const inserted=await prisma.schoolYearSectionInsertion.findFirst({where:{schoolId:admin.schoolId,startYear,schoolSectionId,removedAt:null,globalSchoolYear:{deletedAt:null},schoolSection:{deletedAt:null}},select:{id:true}});
  if(!inserted)throw workspaceError('The selected section is not assigned to this school year.',404);
  const learner=await prisma.learner.findFirst({where:{id:learnerId,classSection:{schoolSectionId,deletedAt:null,schoolYear:{startYear,deletedAt:null},teacher:{schoolId:admin.schoolId}}},select:{id:true,lrn:true,firstName:true,middleName:true,lastName:true,suffix:true,sex:true,assessmentSessions:{where:{isCompleted:true},orderBy:[{dateAdministered:'desc'},{id:'desc'}],include:{sessionMetrics:true,letterResults:{orderBy:{letterIndex:'asc'}},wordResults:{orderBy:{wordIndex:'asc'}},passageMiscues:{orderBy:{wordIndex:'asc'}},comprehensionResults:{orderBy:{questionIndex:'asc'}},hostSessions:{select:{storyTitle:true},orderBy:{updatedAt:'desc'},take:1}}}}});
  if(!learner)throw workspaceError('Learner record unavailable in the selected section.',404);
  return {learner:{...learner,assessmentSessions:learner.assessmentSessions.map(({hostSessions,sessionMetrics,...session})=>({...session,storyTitle:hostSessions[0]?.storyTitle||null,sessionMetrics:sessionMetrics?{...sessionMetrics,miscueAccuracy:Number(sessionMetrics.miscueAccuracy)}:null}))}};
 }
 if(action==='coordinator_setup')return schoolSetup();
 if(action==='coordinator_live_assessments')return readLiveAssessments(q);
 if(action==='coordinator_backups')return listCoordinatorBackups(q,admin);
 if(action==='coordinator_backup_download')return coordinatorBackupDownload(q.get('id'),admin);
 if(action==='coordinator_recovery')return readCoordinatorRecovery(q);
 if(action==='coordinator_teachers'){const term=String(q.get('q')||'').slice(0,100),sort=q.get('sort')==='desc'?'desc':'asc';const teachers=await prisma.user.findMany({where:{role:'teacher',...(term?{fullName:{contains:term,mode:'insensitive'}}:{})},select:{id:true,fullName:true,profilePhoto:true,...teacherSectionCounts},orderBy:[{fullName:sort},{id:'asc'}]});return {teachers,hasMore:false};}
 if(action==='coordinator_years')return {years:await prisma.globalSchoolYear.findMany({where:{deletedAt:null},orderBy:{startYear:'desc'},include:{schoolYears:{where:{deletedAt:null},select:{id:true,_count:{select:{sections:{where:{deletedAt:null}}}}}}}})};
 if(action==='coordinator_library')return {...await sharedLibrary(),...await libraryEditStatus()};
 if(action==='coordinator_library_status')return libraryEditStatus();
 if(['coordinator_windows','coordinator_requests'].includes(action))throw workspaceError('This workflow has been retired. Refresh the application.',410);
 if(action==='coordinator_learner_identity'){const owner=await teacher(q.get('teacher_id')),lrn=String(q.get('lrn')||'').trim();if(!/^\d{10,12}$/.test(lrn))throw workspaceError('Enter a valid LRN.');return {exists:Boolean(await prisma.learner.findFirst({where:{teacherId:owner.id,lrn},select:{id:true}}))};}
 if(action==='coordinator_archive'){const owner=await teacher(q.get('teacher_id'));return handleClassAction('download_class_archive',owner.id,{},q,admin);}
 if(action==='coordinator_classes'){const owner=await teacher(q.get('teacher_id'));return classCatalog(owner.id,true);}
 if(action==='coordinator_report'){const owner=await teacher(q.get('teacher_id')),section=await requireClass(prisma,owner.id,q.get('class_section_id'));const learners=await prisma.learner.findMany({where:{teacherId:owner.id,classSectionId:section.id},orderBy:[{lastName:'asc'},{firstName:'asc'}],include:learnerHistoryInclude});return {teacher:owner,year:section.schoolYear.label,section:section.name,learners:learners.map(l=>({id:l.id,lastName:l.lastName,firstName:l.firstName,middleName:l.middleName,suffix:l.suffix,name:[l.lastName+',',l.firstName,l.middleName,l.suffix].filter(Boolean).join(' '),lrn:l.lrn,sex:l.sex,assessments:l.assessmentSessions.map(s=>({id:s.id,period:s.assessmentPeriod,date:s.dateAdministered,completed:s.isCompleted,classification:s.overallClassification,storyTitle:s.hostSessions?.[0]?.storyTitle||null,remarks:s.sessionMetrics?.remarks,metrics:s.sessionMetrics,letters:s.letterResults,words:s.wordResults,comprehension:s.comprehensionResults,miscues:s.passageMiscues}))}))};}
 return null;
}
export async function coordinatorPost(action,b,admin){
 if(['coordinator_assign_section','coordinator_add_year','coordinator_delete_year'].includes(action))throw workspaceError('School years and section assignments are managed by your school administrator.',403);
 if(action==='coordinator_assessment')return manageSchoolAssessment(b,admin);
 if(action==='coordinator_backup_action')return manageCoordinatorBackup(b,admin);
 if(action==='coordinator_roster')throw workspaceError('Learners are managed by their assigned teacher.',403);
 if(action==='coordinator_activate'||action==='coordinator_review')throw workspaceError('This workflow has been retired. Refresh the application.',410);
 if(action==='coordinator_publish')return publishLibrary(admin.id,b);
 if(action==='coordinator_initialize'){if(!PERIODS.includes(b.period))throw workspaceError('Choose a valid period.');const lib=await sharedLibrary();if(lib.catalogRevisions[b.period])throw workspaceError('This period already has published contents.',409);return publishLibrary(admin.id,{...defaultLibraryBody(b.period),expected_revision:null});}
 if(action==='coordinator_class_action'){if(['save_class_section','delete_class_section','add_learner','delete_learner','delete_learners'].includes(b.class_action))throw workspaceError('Section settings belong to the school administrator. Learners belong to their teacher.',403);if(['save_school_year','edit_school_year'].includes(b.class_action))throw workspaceError('School years are shared. Add a school year above the teacher list.',403);const owner=await teacher(b.teacher_id);if(!CLASS_ACTIONS.has(b.class_action)||b.class_action==='get_classes')throw workspaceError('Choose a valid class action.');const result=await handleClassAction(b.class_action,owner.id,{...b,roster_version:owner.learnerDataVersion},null,admin);await writeAudit(prisma,{actorId:admin.id,teacherId:owner.id,event:'coordinator.class_managed',count:1,detail:{action:b.class_action}});return result;}
 return null;
}
