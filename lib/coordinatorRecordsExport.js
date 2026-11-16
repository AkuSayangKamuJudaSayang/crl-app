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
export function sectionFolderNames(sections){
 const used=new Set();return sections.map(section=>{
  let base=String(section.name||'Section').normalize('NFKC').replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g,' ').replace(/\s+/g,' ').replace(/[. ]+$/g,'').trim().slice(0,64).replace(/[. ]+$/g,'')||'Section';
  if(/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(base))base='Section - '+base;
  let name=base,index=2;while(used.has(name.toLocaleLowerCase('en')))name=base+` (${index++})`;
  used.add(name.toLocaleLowerCase('en'));return name;
 });
}
export async function buildSectionRecordsArchive({sections,loadReport,onProgress=()=>{},isCurrent=()=>true,buildWorkbook=coordinatorWorkbook}){
 if(!sections.length||new Set(sections.map(row=>row.id)).size!==sections.length)throw Error('Choose different sections to export.');
 const {default:JSZip}=await import('jszip'),zip=new JSZip();let done=0;const total=sections.length*RECORD_PERIODS.length,folders=sectionFolderNames(sections);
 onProgress({done,total});
 for(const [index,section]of sections.entries()){const report=await loadReport(section.id);if(!isCurrent())return null;
  for(const period of RECORD_PERIODS){const blob=await buildWorkbook(report,section.id,period);if(!isCurrent())return null;
   zip.file(`${folders[index]}/${recordFilename(String(report.year).includes('-')?String(report.year):`${report.year}-${Number(report.year)+1}`,section.name,period)}`,await blob.arrayBuffer());onProgress({done:++done,total});
  }
 }
 const archive=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:3}});return isCurrent()?archive:null;
}
export const buildCoordinatorRecordsArchive=buildSectionRecordsArchive;
