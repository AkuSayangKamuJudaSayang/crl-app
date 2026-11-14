"use client";
import {useEffect,useMemo,useState} from "react";
import Select from "./Select";
import WorkspaceLoading from "./WorkspaceLoading";
import {READING_PROFILE_LABELS} from "../lib/recordViewModel.mjs";
import {ReadingProfileProgressChart,AnalyticsPeriodChartDialog} from "./SharedAssessmentResults";
import {coordinatorAnalyticsPeriods} from "../lib/coordinatorResultView.mjs";
import {createPortal} from "react-dom";
import {acquirePageScrollLock} from "../lib/pageScrollLock.mjs";
import {printReadingProfileAnalytics} from "../lib/printAnalytics";
import styles from "./Coordinator.module.css";

const PERIODS=["BoSY","MoSY","EoSY"];
function latest(learner,period) {
 return (learner.assessments||[]).filter(a=>a.assessmentPeriod===period)
   .sort((a,b)=>new Date(b.dateAdministered||0)-new Date(a.dateAdministered||0)||Number(b.id)-Number(a.id))[0];
}
export default function CoordinatorAnalytics({api,refreshKey=0}){
 const [catalog,setCatalog]=useState(null),[year,setYear]=useState(""),[section,setSection]=useState("");
 const [records,setRecords]=useState(null),[loading,setLoading]=useState(true),[loadingRecords,setLoadingRecords]=useState(false),[error,setError]=useState("");
 useEffect(()=>{
  let alive=true;setLoading(true);setError("");
  api("coordinator_setup").then(data=>{if(alive){setCatalog(data);setLoading(false);}})
    .catch(e=>{if(alive){setError(e.message);setLoading(false);}});
  return()=>{alive=false;};
 },[api,refreshKey]);
 const years=useMemo(()=>catalog?.years||[],[catalog]);
 const sections=useMemo(()=>(catalog?.sections||[]).filter(s=>!s.deletedAt&&(s.yearInsertions||[])
   .some(row=>String(row.startYear)===year)),[catalog,year]);
 useEffect(()=>{if(year&&!years.some(y=>String(y.startYear)===year)){setYear("");setSection("");}},[year,years]);
 useEffect(()=>{if(section&&!sections.some(s=>String(s.id)===section))setSection("");},[section,sections]);
 useEffect(()=>{
  setRecords(null);setError("");
  if(!year||!section)return;
  let alive=true;setLoadingRecords(true);
  api("coordinator_learner_records",{query:"&start_year="+encodeURIComponent(year)+"&section_id="+encodeURIComponent(section)})
    .then(data=>{if(alive){setRecords(data);setLoadingRecords(false);}})
    .catch(e=>{if(alive){setError(e.message);setLoadingRecords(false);}});
  return()=>{alive=false;};
 },[api,year,section,refreshKey]);
 const [mode,setMode]=useState('percent'),[selection,setSelection]=useState('all'),[focus,setFocus]=useState(null),[expanded,setExpanded]=useState(null),[printError,setPrintError]=useState('');
 useEffect(()=>{if(!expanded)return;const release=acquirePageScrollLock(),escape=event=>{if(event.key==='Escape')setExpanded(null);};window.addEventListener('keydown',escape);return()=>{release();window.removeEventListener('keydown',escape);};},[expanded]);
 const periods=useMemo(()=>coordinatorAnalyticsPeriods(records?.learners||[]),[records]);
 const selectedYear=years.find(y=>String(y.startYear)===year);
 return <section className={styles.panel} aria-label="Reading Coordinator Analytics">
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}>
   <h2>Analytics</h2>{records?<button type="button" onClick={()=>printReadingProfileAnalytics({
    title:`Reading Profile Analytics · ${selectedYear?.label||year} · ${records.section||"Section"}`,periods,selection,mode,scope:{schoolName:records.assignedTeacher?.schoolName||records.schoolName,schoolId:records.schoolId,year:selectedYear?.label||year,section:records.section,teacherName:records.assignedTeacherName||''},onError:message=>setPrintError(message)
   })} style={{padding:"10px 18px",borderRadius:9,border:"1px solid #a0b6d1",background:"#f7faff",color:"#244b75",fontWeight:700,cursor:"pointer"}}>Print Analytics</button>:null}
  </div>
  <div className={styles.learnerRecordScope}>
   <label>School year<Select value={year} disabled={loading} onChange={e=>{setYear(e.target.value);setSection("");}}>
    <option value="" hidden disabled>Select school year</option>{years.map(y=><option key={y.startYear} value={y.startYear}>{y.label}</option>)}
   </Select></label>
   <label>Section<Select value={section} disabled={!year||loading||!sections.length} onChange={e=>setSection(e.target.value)}>
    <option value="" hidden disabled>Select section</option>{sections.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
   </Select></label>
  </div>
  {error?<p role="alert" className={styles.error}>{error}</p>:null}
  {loading?<WorkspaceLoading label="Loading school years and sections…" variant="years"/>:
   !year||!section?<div className={styles.learnerRecordsPrompt}><strong>Select a school year and section</strong><p>Choose both options to compare BoSY, MoSY, and EoSY reading profiles.</p></div>:
   loadingRecords?<WorkspaceLoading label="Loading reading analytics…" variant="records"/>:
   records?<><div className={styles.learnerRecordHeading}><div><strong>{records.section}</strong><span>School Year {year}–{Number(year)+1}</span></div><div className={styles.assignedTeacherSummary}><strong>Assigned teacher: {records.assignedTeacherName||'No assigned teacher'}</strong><span>{records.learners?.length||0} enrolled learners</span></div></div>
    <div className="sharedAssessmentResults analyticsRedesign"><ReadingProfileProgressChart periods={periods} mode={mode} onModeChange={setMode} focus={focus} onFocus={setFocus} selection={selection} onSelectionChange={setSelection} onExpand={setExpanded}/></div>
    {expanded&&typeof document!=="undefined"?createPortal(<div className="sharedAssessmentResults"><AnalyticsPeriodChartDialog period={periods.find(row=>row.period===expanded)} periods={periods} mode={mode} onClose={()=>setExpanded(null)}/></div>,document.body):null}
    {printError&&<p role="alert" className={styles.error}>{printError}</p>}
   </>:null}
 </section>;
}
