"use client";
import {useMemo,useRef,useState} from 'react';
import AssessmentRecordViews from './AssessmentRecordViews';
import {rosterRecords} from '../lib/rosterRecords.mjs';
import {buildScoresheetHeader,buildClassSummaryRows} from '../lib/recordViewModel.mjs';
import {coordinatorRecordData} from '../lib/coordinatorRecordData.mjs';
import {printAssessmentElement} from '../lib/printRecords';
import styles from './Coordinator.module.css';
export default function CoordinatorRecords({report,teacherId,sectionId}){
 const [period,setPeriod]=useState('BoSY'),[view,setView]=useState('scoresheet'),[zoom,setZoom]=useState(1),content=useRef(null);
 const {learners,assessments}=useMemo(()=>coordinatorRecordData(report),[report]);
 const records=useMemo(()=>rosterRecords(learners,assessments,period),[learners,assessments,period]);
 const header=useMemo(()=>buildScoresheetHeader(learners,records),[learners,records]),summary=useMemo(()=>buildClassSummaryRows(learners,records),[learners,records]);
 const user={full_name:report.teacher.fullName,school_name:report.teacher.schoolName,school_id:report.teacher.schoolId};
 return <section className={`${styles.panel} ${styles.recordsPanel}`}><div className={styles.rosterHeading}><strong>School Year {report.year}</strong><small>Section: {report.section}</small><h2>Assessment records</h2></div><div className={styles.recordsToolbar}><div className={styles.segmented} role="group" aria-label="Assessment timeline">{['BoSY','MoSY','EoSY'].map(p=><button key={p} aria-pressed={period===p} onClick={()=>setPeriod(p)}>{p}</button>)}</div><div className={styles.segmented} role="group" aria-label="Report view">{[['scoresheet','Scoresheet'],['summary','Class Summary'],['class-record','Class Record']].map(([v,l])=><button key={v} aria-pressed={view===v} onClick={()=>setView(v)}>{l}</button>)}</div><div className={styles.rosterTools}><button onClick={()=>printAssessmentElement(content.current,`${report.teacher.fullName} · ${report.year} · ${report.section} · ${period}`)}>Print</button><a className={styles.secondary} href={`/api/reports/excel?teacher_id=${teacherId}&class_section_id=${encodeURIComponent(sectionId)}&period=${period}&mode=${view==='summary'?'summary':'scoresheet'}`}>Export</a></div></div><div ref={content}><AssessmentRecordViews readOnly recordsView={view} currentRecords={records} currentPeriod={period} learners={learners} selectedClass={{name:report.section}} user={user} classSummaryRows={summary} scoresheetHeader={header} scoresheetZoom={zoom} setScoresheetZoom={setZoom} scoresheetMode="view" classReadonly /></div></section>;
}
