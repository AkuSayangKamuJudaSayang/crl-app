'use client';
import {analyticsClassChoices} from './analyticsClassScope.mjs';
import {classIdOf} from './classWorkspace.mjs';
import {buildSectionRecordsArchive} from './coordinatorRecordsExport';
export function teacherExportScope(catalog,yearId,teacherId){
 if(!Number.isSafeInteger(Number(teacherId))||Number(teacherId)<=0)return {year:null,sections:[]};
 const choices=analyticsClassChoices(catalog,teacherId),year=choices.years.find(row=>row.id===yearId);
 return {year,sections:year?choices.sections.filter(row=>row.schoolYearId===year.id&&!row.unassignedAt):[]};
}
export async function buildTeacherRecordsArchive({catalog,yearId,teacher,learners,assessments,onProgress,isCurrent,fetcher=fetch,buildOffline}){
 const {year,sections}=teacherExportScope(catalog,yearId,teacher?.id);
 if(!year||!sections.length)throw Error('Choose a school year with assigned sections.');
 return buildSectionRecordsArchive({sections,onProgress,isCurrent,loadReport:async()=>({year:year.label}),buildWorkbook:async(_,sectionId,period)=>{
  const section=sections.find(row=>row.id===sectionId);
  try{
   const response=await fetcher(`/api/reports/excel?period=${encodeURIComponent(period)}&class_section_id=${encodeURIComponent(sectionId)}`,{credentials:'include',cache:'no-store',headers:{Accept:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}});
   if(!response.ok){const data=await response.json().catch(()=>({}));throw Object.assign(Error(data.error||'Unable to export this section.'),{httpStatus:response.status});}
   return await response.blob();
  }catch(error){
   // A permission/server failure must never silently become a partial backup.
   if(error.httpStatus||!(error instanceof TypeError||/offline|failed to fetch|network/i.test(String(error.message))))throw error;
   const scoped=learners.filter(row=>classIdOf(row)===sectionId&&(!row.teacher_id&&!row.teacherId||Number(row.teacher_id??row.teacherId)===Number(teacher.id)));
   const ids=new Set(scoped.map(row=>Number(row.id))),results=assessments.filter(row=>ids.has(Number(row.learner_id??row.learnerId))&&(!row.teacher_id&&!row.teacherId||Number(row.teacher_id??row.teacherId)===Number(teacher.id)));
   const build=buildOffline||(await import('./offlineExcelExport')).buildOfflineAssessmentWorkbook;
   return build({teacher:{...teacher,section:section.name,schoolYear:year.label,classSectionId:sectionId},learners:scoped,assessments:results,period});
  }
 }});
}
