import {prisma} from './prisma';
import {learnerHistoryInclude} from './adminHistory';
import {workspaceError} from './classWorkspace.mjs';

const UUID=/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;
const PERIODS=['BoSY','MoSY','EoSY'];
const safeYear=value=>{const n=Number(value);return Number.isInteger(n)&&n>=2000&&n<=2200?n:null;};
const positive=value=>{const n=Number(value);return Number.isSafeInteger(n)&&n>0?n:null;};
const fullName=row=>[row.firstName,row.middleName,row.lastName,row.suffix].filter(Boolean).join(' ');
const sessionSummary=s=>({
 id:s.id,period:s.assessmentPeriod,date:s.dateAdministered,
 completed:s.isCompleted,classification:s.overallClassification,
 metrics:s.sessionMetrics||null
});
function sortItems(items,key){return [...(items||[])].sort((a,b)=>a[key]-b[key]||a.id-b.id);}
const sessionDetail=s=>({
 ...sessionSummary(s),
 storyTitle:s.hostSessions?.[0]?.storyTitle||null,
 letters:sortItems(s.letterResults,'letterIndex'),
 words:sortItems(s.wordResults,'wordIndex'),
 miscues:sortItems(s.passageMiscues,'wordIndex'),
 comprehension:sortItems(s.comprehensionResults,'questionIndex')
});

// Read access is limited to the coordinator's own school and a section
// explicitly inserted into an active school year. Teacher ownership is
// retained; class copies from earlier assignments are not merged by LRN.
export async function coordinatorLearnerRecords(action,q,actor,db=prisma){
 if(actor?.role!=='reading_coordinator'||!actor?.schoolId)throw workspaceError('Reading Coordinator access required.',403);
 const schoolId=actor.schoolId;
 if(action==='coordinator_learner_record_catalog'){
  const [years,insertions]=await Promise.all([
   db.globalSchoolYear.findMany({where:{schoolId,deletedAt:null},select:{startYear:true,label:true},orderBy:{startYear:'desc'}}),
   db.schoolYearSectionInsertion.findMany({
    where:{schoolId,removedAt:null,globalSchoolYear:{deletedAt:null},schoolSection:{deletedAt:null}},
    select:{startYear:true,schoolSectionId:true,schoolSection:{select:{name:true}}}
   })
  ]);
  const allowed=new Set(years.map(row=>row.startYear));
  return {years,sections:insertions.filter(row=>allowed.has(row.startYear)).map(row=>({
   id:row.schoolSectionId,startYear:row.startYear,name:row.schoolSection.name
  })).sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id))};
 }
 if(!['coordinator_learner_record_list','coordinator_learner_record_detail'].includes(action))return null;
 const startYear=safeYear(q.get('start_year')),schoolSectionId=String(q.get('school_section_id')||'');
 if(startYear===null||!UUID.test(schoolSectionId))throw workspaceError('Select a valid school year and section.',400);
 const insertion=await db.schoolYearSectionInsertion.findFirst({
  where:{schoolId,startYear,schoolSectionId,removedAt:null,globalSchoolYear:{deletedAt:null},schoolSection:{deletedAt:null}},
  select:{schoolSection:{select:{name:true}},globalSchoolYear:{select:{label:true}}}
 });
 if(!insertion)throw workspaceError('This section is no longer available in the selected school year. Refresh first.',404);
 const classes=await db.classSection.findMany({
  where:{schoolSectionId,deletedAt:null,schoolYear:{schoolId,startYear,deletedAt:null}},
  select:{id:true,teacherId:true,unassignedAt:true,teacher:{select:{fullName:true}}}
 });
 const ids=classes.map(row=>row.id),owner=new Map(classes.map(row=>[row.id,{teacherId:row.teacherId,teacherName:row.teacher.fullName,unassigned:Boolean(row.unassignedAt)}]));
 const context={startYear,year:insertion.globalSchoolYear.label,section:insertion.schoolSection.name};
 if(action==='coordinator_learner_record_detail'){
  const learnerId=positive(q.get('learner_id'));
  if(!learnerId)throw workspaceError('Choose a valid learner.',400);
  if(!ids.length)throw workspaceError('Learner record not found for this section.',404);
  const learner=await db.learner.findFirst({
   where:{id:learnerId,classSectionId:{in:ids}},
   include:learnerHistoryInclude
  });
  if(!learner)throw workspaceError('Learner record not found for this section.',404);
  return {...context,learner:{
   id:learner.id,lrn:learner.lrn,firstName:learner.firstName,middleName:learner.middleName,
   lastName:learner.lastName,suffix:learner.suffix,sex:learner.sex,fullName:fullName(learner),
   ...owner.get(learner.classSectionId),
   assessments:(learner.assessmentSessions||[]).map(sessionDetail).sort((a,b)=>{
    const pa=PERIODS.indexOf(a.period),pb=PERIODS.indexOf(b.period);
    return pa-pb||new Date(b.date)-new Date(a.date)||b.id-a.id;
   })
  }};
 }
 if(!ids.length)return {...context,learners:[]};
 const learners=await db.learner.findMany({
  where:{classSectionId:{in:ids}},
  orderBy:[{lastName:'asc'},{firstName:'asc'},{id:'asc'}],
  select:{
   id:true,lrn:true,firstName:true,middleName:true,lastName:true,suffix:true,sex:true,classSectionId:true,
   assessmentSessions:{orderBy:[{dateAdministered:'desc'},{id:'desc'}],select:{
    id:true,assessmentPeriod:true,dateAdministered:true,isCompleted:true,
    overallClassification:true,sessionMetrics:true
   }}
  }
 });
 return {...context,learners:learners.map(row=>({
  id:row.id,lrn:row.lrn,firstName:row.firstName,middleName:row.middleName,
  lastName:row.lastName,suffix:row.suffix,sex:row.sex,fullName:fullName(row),
  ...owner.get(row.classSectionId),assessments:row.assessmentSessions.map(sessionSummary)
 }))};
}
