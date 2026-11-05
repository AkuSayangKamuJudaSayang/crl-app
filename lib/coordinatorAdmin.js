import {teacherSectionCounts} from './teacherDirectory';
import {readLiveAssessments} from './liveAssessments';
import {listCoordinatorBackups,coordinatorBackupDownload,manageCoordinatorBackup} from './coordinatorBackups';
import {readCoordinatorRecovery} from './coordinatorRecovery';
import {manageCoordinatorRoster} from './coordinatorRoster';
import {schoolYearLabel} from './classWorkspace.mjs';
import {prisma} from './prisma';
import {handleClassAction,requireClass,classCatalog,deleteSharedSchoolYear} from './classWorkspaces';
import {CLASS_ACTIONS,workspaceError} from './classWorkspace.mjs';
import {sharedLibrary,publishLibrary,defaultLibraryBody,libraryEditStatus} from './coordinatorPolicy';
import {writeAudit,learnerHistoryInclude} from './adminHistory';
const PERIODS=['BoSY','MoSY','EoSY'];
async function teacher(id){const row=await prisma.user.findFirst({where:{id:Number(id)||0,role:'teacher'},select:{id:true,fullName:true,schoolName:true,schoolId:true,learnerDataVersion:true}});if(!row)throw workspaceError('Choose a valid teacher.',404);return row;}
export async function coordinatorGet(action,q,admin){
 if(action==='coordinator_live_assessments')return readLiveAssessments(q);
 if(action==='coordinator_backups')return listCoordinatorBackups(q,admin);
 if(action==='coordinator_backup_download')return coordinatorBackupDownload(q.get('id'),admin);
 if(action==='coordinator_recovery')return readCoordinatorRecovery(q);
 if(action==='coordinator_teachers'){const term=String(q.get('q')||'').slice(0,100),sort=q.get('sort')==='desc'?'desc':'asc';const teachers=await prisma.user.findMany({where:{role:'teacher',...(term?{fullName:{contains:term,mode:'insensitive'}}:{})},select:{id:true,fullName:true,profilePhoto:true,...teacherSectionCounts},orderBy:[{fullName:sort},{id:'asc'}]});return {teachers,hasMore:false};}
 if(action==='coordinator_years')return {years:await prisma.globalSchoolYear.findMany({where:{deletedAt:null},orderBy:{startYear:'asc'},include:{schoolYears:{where:{deletedAt:null},select:{id:true,_count:{select:{sections:{where:{deletedAt:null}}}}}}}})};
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
 if(action==='coordinator_backup_action')return manageCoordinatorBackup(b,admin);
 if(action==='coordinator_delete_year')return deleteSharedSchoolYear(b,admin);
 if(action==='coordinator_roster'){const owner=await teacher(b.teacher_id);return manageCoordinatorRoster(owner,b,admin);}
 if(action==='coordinator_add_year'){const startYear=Number(b.start_year);const label=schoolYearLabel(startYear);return prisma.$transaction(async tx=>{await tx.$queryRaw`SELECT pg_advisory_xact_lock(177631,3)::text AS locked`;if((await tx.globalSchoolYear.findUnique({where:{startYear}}))?.deletedAt===null)throw workspaceError('This school year already exists.',409);const year=await tx.globalSchoolYear.upsert({where:{startYear},create:{startYear,label},update:{deletedAt:null}});await writeAudit(tx,{actorId:admin.id,event:'school_year.created_globally',count:1,detail:{startYear}});return {status:'ok',year};});}
 if(action==='coordinator_activate'||action==='coordinator_review')throw workspaceError('This workflow has been retired. Refresh the application.',410);
 if(action==='coordinator_publish')return publishLibrary(admin.id,b);
 if(action==='coordinator_initialize'){if(!PERIODS.includes(b.period))throw workspaceError('Choose a valid period.');const lib=await sharedLibrary();if(lib.catalogRevisions[b.period])throw workspaceError('This period already has published contents.',409);return publishLibrary(admin.id,{...defaultLibraryBody(b.period),expected_revision:null});}
 if(action==='coordinator_class_action'){if(['save_school_year','edit_school_year'].includes(b.class_action))throw workspaceError('School years are shared. Add a school year above the teacher list.',403);const owner=await teacher(b.teacher_id);if(!CLASS_ACTIONS.has(b.class_action)||b.class_action==='get_classes')throw workspaceError('Choose a valid class action.');const result=await handleClassAction(b.class_action,owner.id,{...b,roster_version:owner.learnerDataVersion},null,admin);await writeAudit(prisma,{actorId:admin.id,teacherId:owner.id,event:'coordinator.class_managed',count:1,detail:{action:b.class_action}});return result;}
 return null;
}
