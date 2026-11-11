"use client";
import {useEffect,useMemo,useState} from "react";
import Select from "./Select";
import WorkspaceLoading from "./WorkspaceLoading";
import {READING_PROFILE_LABELS} from "../lib/recordViewModel.mjs";
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
 const periods=useMemo(()=>PERIODS.map(period=>{
  const rows=(records?.learners||[]).map(learner=>latest(learner,period)).filter(Boolean);
  return {period,total:rows.length,profiles:READING_PROFILE_LABELS.map(label=>{
   const count=rows.filter(a=>String(a.overallClassification||a.classificationLabel||"").trim().toLowerCase()===label.toLowerCase()).length;
   return {label,count,percent:rows.length?Math.round(count/rows.length*100):0};
  })};
 }),[records]);
 const selectedYear=years.find(y=>String(y.startYear)===year);
 return <section className={styles.panel} aria-label="Reading Coordinator Analytics">
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}>
   <h2>Analytics</h2>{records?<button type="button" onClick={()=>printReadingProfileAnalytics({
    title:`Reading Profile Analytics · ${selectedYear?.label||year} · ${records.section||"Section"}`,periods
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
   records?<><div className={styles.learnerRecordHeading}><div><strong>{records.section}</strong><span>School Year {year}–{Number(year)+1}</span></div><span>{records.learners?.length||0} enrolled learners</span></div>
    <div aria-label="BoSY MoSY EoSY reading profile charts"
      style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(235px,1fr))",gap:14,marginTop:18}}>
      {periods.map(row=><article key={row.period} style={{border:"1px solid #dbe3ee",borderRadius:13,padding:16,background:"var(--card-bg,#ffffff)"}}>
        <h3 style={{fontSize:18,margin:"0 0 3px"}}>{row.period}</h3>
        <p style={{fontSize:12,opacity:.75,margin:"0 0 14px"}}>{row.total} assessed learner{row.total===1?"":"s"}</p>
        {!row.total?<p style={{fontSize:13,opacity:.8}}>Not assessed yet.</p>:row.profiles.map((item,index)=>
          <div key={item.label} style={{marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",gap:8,fontSize:12,marginBottom:5}}>
              <span>{item.label}</span><strong>{item.count} ({item.percent}%)</strong>
            </div>
            <div style={{height:9,background:"#e8edf3",borderRadius:99,overflow:"hidden"}}>
              <div role="img" aria-label={item.label+" "+item.percent+" percent"}
                style={{height:"100%",width:item.percent+"%",background:["#ad6e69","#d4a15e","#b8a95b","#699d88","#577db5"][index]||"#577db5",borderRadius:99}} />
            </div>
          </div>
        )}
      </article>)}
    </div>
    <div style={{overflowX:"auto",marginTop:16}}>
     <table className={styles.learnerRecordTable} style={{minWidth:620}}>
      <thead><tr><th>Reading profile</th>{PERIODS.map(p=><th key={p}>{p}</th>)}</tr></thead>
      <tbody><tr><th scope="row">Learners assessed</th>{periods.map(p=><td key={p.period}>{p.total}</td>)}</tr>
       {READING_PROFILE_LABELS.map(label=><tr key={label}><th scope="row">{label}</th>{periods.map(p=>{
        const profile=p.profiles.find(item=>item.label===label);
        return <td key={p.period}>{profile?.count||0} ({profile?.percent||0}%)</td>;
       })}</tr>)}
      </tbody>
     </table>
    </div>
    <p style={{fontSize:13,marginTop:12,opacity:.8}}>Counts include completed assessments only. Percentages are based on the assessed learners for each timeline.</p>
   </>:null}
 </section>;
}
