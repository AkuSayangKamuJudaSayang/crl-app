'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import AssessmentRecordViews from './AssessmentRecordViews';
import CoordinatorIndividualResults from './CoordinatorIndividualResults';
import {rosterRecords} from '../lib/rosterRecords.mjs';
import {buildScoresheetHeader,buildClassSummaryRows} from '../lib/recordViewModel.mjs';
import {coordinatorRecordData} from '../lib/coordinatorRecordData.mjs';
import {coordinatorWorkbook,recordFilename} from '../lib/coordinatorRecordsExport';
import {downloadBlob} from '../lib/downloadFile';
import {printAssessmentElement} from '../lib/printRecords';
import styles from './Coordinator.module.css';
export default function CoordinatorRecords({report,sectionId,api}){
 const [period,setPeriod]=useState('BoSY'),[view,setView]=useState('scoresheet'),[zoom,setZoom]=useState(1),[exporting,setExporting]=useState(false),[error,setError]=useState(''),content=useRef(null);
 const exportRequest=useRef(0);
 useEffect(()=>()=>{exportRequest.current++;},[]);
 const [selected,setSelected]=useState(null),[detail,setDetail]=useState(null),[detailLoading,setDetailLoading]=useState(false),[detailError,setDetailError]=useState('');
 const {learners,assessments}=useMemo(()=>coordinatorRecordData(report),[report]);
 const records=useMemo(()=>rosterRecords(learners,assessments,period),[learners,assessments,period]);
 const header=useMemo(()=>buildScoresheetHeader(learners,records),[learners,records]),summary=useMemo(()=>buildClassSummaryRows(learners,records),[learners,records]);
 const year=String(report.year).includes('-')?String(report.year):`${report.year}-${Number(report.year)+1}`;
 const user={full_name:report.assignedTeacherName||report.teacher?.fullName||'',school_name:report.schoolName||report.assignedTeacher?.schoolName||report.teacher?.schoolName||'',school_id:report.schoolId||report.teacher?.schoolId||''};
 useEffect(()=>{if(!selected)return;let active=true;setDetail(null);setDetailLoading(true);setDetailError('');api('coordinator_learner_result',{query:`&start_year=${String(report.year).slice(0,4)}&section_id=${encodeURIComponent(sectionId)}&learner_id=${encodeURIComponent(selected.id)}`}).then(result=>{if(active){setDetail(result);setDetailLoading(false);}}).catch(e=>{if(active){setDetailError(e.message);setDetailLoading(false);}});return()=>{active=false;};},[selected,api,report.year,sectionId]);
 const exportRecord=async()=>{if(exporting)return;const request=++exportRequest.current;setExporting(true);setError('');try{const fresh=await api('coordinator_learner_records',{query:`&start_year=${String(report.year).slice(0,4)}&section_id=${encodeURIComponent(sectionId)}`});if(request!==exportRequest.current)return;const blob=await coordinatorWorkbook(fresh,sectionId,period);if(request===exportRequest.current)downloadBlob(blob,recordFilename(year,fresh.section,period));}catch(e){if(request===exportRequest.current)setError(e.message);}finally{if(request===exportRequest.current)setExporting(false);}};
 return <section className={`${styles.recordsPanel} coordinatorRecordPanel`} aria-label={`Assessment records for ${report.section}`}>
  <div className={styles.rosterHeading}><strong>School Year {year}</strong><div>Section: {report.section}</div><p>Assigned teacher: {user.full_name||'No assigned teacher'} · {learners.length} enrolled learners</p></div>
  <div className={styles.recordsToolbar}><div className={styles.segmented} role="group" aria-label="Assessment timeline">{['BoSY','MoSY','EoSY'].map(p=><button type="button" key={p} aria-pressed={period===p} onClick={()=>setPeriod(p)}>{p}</button>)}</div><div className={styles.segmented} role="group" aria-label="Report view">{[['scoresheet','Scoresheet'],['summary','Class Summary'],['class-record','Class Record']].map(([v,l])=><button type="button" key={v} aria-pressed={view===v} onClick={()=>setView(v)}>{l}</button>)}</div><div className={styles.rosterTools}><button type="button" onClick={()=>{try{printAssessmentElement(content.current,`School Year ${year} · ${report.section} · ${user.full_name||'No assigned teacher'} · ${period} · ${view}`);}catch(e){setError(e.message);}}}>Print</button><button type="button" disabled={exporting} onClick={exportRecord}>{exporting?'Please wait…':'Export Excel'}</button></div></div>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  <div ref={content}><AssessmentRecordViews readOnly onViewLearner={setSelected} recordsView={view} currentRecords={records} currentPeriod={period} learners={learners} selectedClass={{name:report.section}} user={user} classSummaryRows={summary} scoresheetHeader={header} scoresheetZoom={zoom} setScoresheetZoom={setZoom} scoresheetMode="view" classReadonly /></div>
  {selected&&<CoordinatorIndividualResults key={selected.id} initialPeriod={period} learner={detail?.learner} scope={detail?.printScope} loading={detailLoading} error={detailError} onClose={()=>setSelected(null)}/>}
 </section>;
}
