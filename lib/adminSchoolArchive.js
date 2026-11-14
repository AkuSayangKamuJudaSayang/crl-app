import {openPrivateData} from './adminHistory';
import {handleClassAction} from './classWorkspaces';
import {workspaceError,UUID_PATTERN} from './classWorkspace.mjs';
const DAY=86400000;
const archiveFields={id:true,teacherId:true,sourceSchoolYearId:true,memberArchiveIds:true,sectionCount:true,learnerCount:true,expiresAt:true};
// Fresh admin authentication and school RLS are established by /api/access.
// Read immutable year snapshots; never rebuild evidence from another school year.
export async function readAdminSchoolArchive(db,q,admin,now=new Date()){
 if(admin?.role!=='admin'||!admin.schoolId)throw workspaceError('School administrator access required.',403);
 if(q.has('section_id'))return readArchivedSection(db,q,admin,now);
 const where={schoolId:admin.schoolId,deletedAt:{gte:new Date(+now-30*DAY)}};
 const requested=q.get('start_year');
 if(requested!==null){const year=Number(requested);if(!Number.isInteger(year)||year<2000||year>2200)throw workspaceError('Choose a valid school year.');where.startYear=year;}
 const years=await db.globalSchoolYear.findMany({where,orderBy:{deletedAt:'desc'},select:{startYear:true,label:true,deletedAt:true,sectionInsertions:{where:{removedAt:null},select:{schoolSection:{select:{id:true,name:true}}}}}});
 if(requested!==null&&!years.length)throw workspaceError('This school-year archive expired or is unavailable.',410);
 const owned=years.length?await db.schoolYear.findMany({where:{schoolId:admin.schoolId,startYear:{in:years.map(row=>row.startYear)},deletedAt:{not:null}},select:{id:true,startYear:true,teacherId:true}}):[];
 const bundles=owned.length?await db.classArchive.findMany({where:{sourceSchoolYearId:{in:owned.map(row=>row.id)},teacher:{schoolId:admin.schoolId},kind:'school_year',purgedAt:null,expiresAt:{gt:now}},select:archiveFields}):[];
 const entries=years.map(year=>{const ids=new Set(owned.filter(row=>row.startYear===year.startYear).map(row=>row.id));const members=bundles.filter(row=>ids.has(row.sourceSchoolYearId));return {startYear:year.startYear,label:year.label,deletedAt:year.deletedAt,expiresAt:new Date(+year.deletedAt+30*DAY),sectionCount:Math.max(year.sectionInsertions.length,members.reduce((n,row)=>n+(row.sectionCount||0),0)),learnerCount:members.reduce((n,row)=>n+row.learnerCount,0)};});
 if(requested===null){
  const sections=await db.schoolSection.findMany({where:{schoolId:admin.schoolId,deletedAt:{not:null},expiresAt:{gt:now}},select:{id:true,name:true,deletedAt:true,expiresAt:true},orderBy:{deletedAt:'desc'}});
  return {years:entries,sections,serverNow:now.toISOString()};
 }
 const members=bundles.flatMap(bundle=>(bundle.memberArchiveIds||[]).map(id=>({id,teacherId:bundle.teacherId})));
 const sectionWhere={OR:members,purgedAt:null,expiresAt:{gt:now},kind:'section',teacher:{schoolId:admin.schoolId}};
 const id=q.get('archive_id');
 if(id){
  if(!UUID_PATTERN.test(id)||!members.some(row=>row.id===id))throw workspaceError('Choose a section in this school-year archive.',404);
  const row=await db.classArchive.findFirst({where:{...sectionWhere,id},select:{id:true,teacherId:true,schoolYearLabel:true,sectionName:true,encryptedSnapshot:true}});
  if(!row)throw workspaceError('This section archive expired or is unavailable.',410);
  return readMember(row,q,admin,entries[0]);
 }
 const sections=members.length?await db.classArchive.findMany({where:sectionWhere,select:{id:true,sectionName:true,learnerCount:true,teacher:{select:{fullName:true}}},orderBy:{sectionName:'asc'}}):[];
 const names=new Set(sections.map(row=>row.sectionName));
 return {year:entries[0],sections:[...sections.map(row=>({id:row.id,name:row.sectionName,teacherName:row.teacher.fullName,learnerCount:row.learnerCount})),...years[0].sectionInsertions.filter(row=>!names.has(row.schoolSection.name)).map(row=>({id:null,name:row.schoolSection.name,learnerCount:0}))],serverNow:now.toISOString()};
}

async function readMember(row,q,admin,year){
 if(q.get('download')==='1')return handleClassAction('download_class_archive',row.teacherId,{archive_id:row.id},null,admin);
 let snapshot;try{snapshot=openPrivateData(row.encryptedSnapshot);}catch{throw workspaceError('The saved section details cannot be opened. No archive data has been changed.',409);}
 if(snapshot?.kind!=='class_archive'||snapshot.teacherId!==row.teacherId||snapshot.schoolYear!==year.label||!Array.isArray(snapshot.learners))throw workspaceError('The saved section details are invalid. No archive data has been changed.',409);
 const page=Math.max(0,Math.floor(Number(q.get('page'))||0));if(page>200)throw workspaceError('Choose a valid page.');
 return {year,section:{id:row.id,name:row.sectionName},learners:snapshot.learners.slice(page*25,(page+1)*25),total:snapshot.learners.length,page};
}
async function readArchivedSection(db,q,admin,now){
 const id=q.get('section_id');if(!UUID_PATTERN.test(id||''))throw workspaceError('Choose a valid section.',400);
 const record=await db.schoolSection.findFirst({where:{id,schoolId:admin.schoolId,deletedAt:{not:null},expiresAt:{gt:now}},select:{id:true,name:true,deletedAt:true,expiresAt:true,recoveryAssignments:true,recoveryClassId:true,recoveryArchiveId:true}});
 if(!record)throw workspaceError('This section archive expired or is unavailable.',410);
 const recovery=Array.isArray(record.recoveryAssignments)&&record.recoveryAssignments.length?record.recoveryAssignments:record.recoveryClassId?[{classSectionId:record.recoveryClassId,archiveId:record.recoveryArchiveId}]:[];
 const references=recovery.filter(item=>item&&UUID_PATTERN.test(String(item.classSectionId||'')));
 const classes=references.length?await db.classSection.findMany({where:{id:{in:references.map(item=>item.classSectionId)},schoolSectionId:id,teacher:{schoolId:admin.schoolId},schoolYear:{schoolId:admin.schoolId}},select:{id:true,teacherId:true,teacher:{select:{fullName:true}},schoolYear:{select:{label:true,startYear:true}}}}):[];
 const pairs=references.flatMap(item=>{const prior=classes.find(row=>row.id===item.classSectionId);return prior&&UUID_PATTERN.test(String(item.archiveId||''))?[{id:item.archiveId,teacherId:prior.teacherId,sourceSectionId:prior.id}]:[];});
 const archives=pairs.length?await db.classArchive.findMany({where:{OR:pairs,kind:'section',purgedAt:null,expiresAt:{gt:now},teacher:{schoolId:admin.schoolId}},select:{id:true,teacherId:true,sourceSectionId:true,sectionName:true,schoolYearLabel:true,learnerCount:true}}):[];
 const archiveId=q.get('archive_id');
 if(archiveId){
  const member=archives.find(row=>row.id===archiveId);if(!member)throw workspaceError('Choose a retained assignment in this section archive.',404);
  const row=await db.classArchive.findFirst({where:{id:member.id,teacherId:member.teacherId,teacher:{schoolId:admin.schoolId},purgedAt:null,expiresAt:{gt:now},kind:'section'},select:{id:true,teacherId:true,sectionName:true,encryptedSnapshot:true}});
  if(!row)throw workspaceError('This assignment archive expired or is unavailable.',410);
  return readMember(row,q,admin,{label:member.schoolYearLabel});
 }
 return {record:{id:record.id,name:record.name,deletedAt:record.deletedAt,expiresAt:record.expiresAt},sections:classes.map(prior=>{const member=archives.find(row=>row.sourceSectionId===prior.id);return {id:member?.id||null,classSectionId:prior.id,name:record.name,schoolYearLabel:prior.schoolYear.label,teacherName:prior.teacher.fullName,learnerCount:member?.learnerCount??null};}),serverNow:now.toISOString()};
}
