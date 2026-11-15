'use client';
import {coordinatorRecordData} from './coordinatorRecordData.mjs';
export const RECORD_PERIODS=['BoSY','MoSY','EoSY'];
export function coordinatorWorkbookInput(report,sectionId,period){
 const {learners,assessments}=coordinatorRecordData(report);
 return {teacher:{full_name:report.assignedTeacherName||report.teacher?.fullName||'',school_name:report.schoolName||report.assignedTeacher?.schoolName||report.teacher?.schoolName||'',school_id:report.schoolId||report.teacher?.schoolId||'',section:report.section,schoolYear:String(report.year).includes('-')?String(report.year):`${report.year}-${Number(report.year)+1}`,classSectionId:sectionId},learners:learners.map(row=>({...row,class_section_id:sectionId})),assessments,period};
}
export async function coordinatorWorkbook(report,sectionId,period){
 const {buildOfflineAssessmentWorkbook}=await import('./offlineExcelExport');
 return buildOfflineAssessmentWorkbook(coordinatorWorkbookInput(report,sectionId,period));
}
export const recordFilename=(year,section,period)=>`CRLA_${String(year).replace(/[^0-9-]/g,'')}_${String(section).replace(/[^a-z0-9_-]/gi,'_')}_${period}.xlsx`;
export async function buildCoordinatorRecordsArchive({sections,loadReport,onProgress=()=>{},isCurrent=()=>true,buildWorkbook=coordinatorWorkbook}){
 if(!sections.length||new Set(sections.map(row=>row.id)).size!==sections.length)throw Error('Choose different sections to export.');
 const {default:JSZip}=await import('jszip'),zip=new JSZip();let done=0;const total=sections.length*RECORD_PERIODS.length;
 onProgress({done,total});
 for(const section of sections){const report=await loadReport(section.id);if(!isCurrent())return null;
  for(const period of RECORD_PERIODS){const blob=await buildWorkbook(report,section.id,period);if(!isCurrent())return null;
   zip.file(`${section.name.replace(/[^a-z0-9_-]/gi,'_')}_${section.id}/${recordFilename(String(report.year).includes('-')?String(report.year):`${report.year}-${Number(report.year)+1}`,section.name,period)}`,await blob.arrayBuffer());onProgress({done:++done,total});
  }
 }
 const archive=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:3}});return isCurrent()?archive:null;
}
