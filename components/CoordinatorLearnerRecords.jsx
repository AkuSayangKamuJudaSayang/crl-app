'use client';
import {useEffect,useMemo,useState} from 'react';
import ClassDialog from './ClassDialog';
import Select from './Select';
import WorkspaceLoading from './WorkspaceLoading';
import styles from './Coordinator.module.css';
import {AnalyticsLearnerResultPanel} from './SharedAssessmentResults';
import {coordinatorSessionResult,coordinatorResultLearner} from '../lib/coordinatorResultView.mjs';
const PERIODS=['BoSY','MoSY','EoSY'];
const fullName=learner=>[learner.lastName+',',learner.firstName,learner.middleName,learner.suffix].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
const completedFor=(learner,period)=>(learner.assessments||[]).filter(a=>a.assessmentPeriod===period).sort((a,b)=>new Date(b.dateAdministered)-new Date(a.dateAdministered)||b.id-a.id)[0]||null;
const displayDate=value=>value?new Date(value).toLocaleDateString('en-PH',{year:'numeric',month:'short',day:'numeric',timeZone:'Asia/Manila'}):'—';
const valueOrDash=value=>value===null||value===undefined||value===''?'—':String(value);
function IndividualResults({learner,scope,loading,error,onClose}){
 const results=(learner?.assessmentSessions||[]).filter(row=>row.isCompleted);
 const [period,setPeriod]=useState(()=>results.at(-1)?.assessmentPeriod||'BoSY'),[printError,setPrintError]=useState('');
 const selected=results.find(row=>row.assessmentPeriod===period)||results[0];
 const effectivePeriod=selected?.assessmentPeriod||period;
 const result=coordinatorSessionResult(selected,learner?.id);
 return <ClassDialog title="Learner results" wide showClose onClose={onClose}><div className="sharedAssessmentResults"><AnalyticsLearnerResultPanel selectedLearner={coordinatorResultLearner(learner)} selectedPeriods={results.map(row=>row.assessmentPeriod)} period={effectivePeriod} onPeriodChange={setPeriod} loading={loading} error={error} selectedAssessment={result} detail={result} section={scope?.section} year={scope?.year} teacher={scope?.teacher} onPrintError={setPrintError}/>{printError&&<p role="alert">{printError}</p>}</div></ClassDialog>;
}
export default function CoordinatorLearnerRecords({api,refreshKey=0}){
 const [catalog,setCatalog]=useState(null),[year,setYear]=useState(''),[section,setSection]=useState(''),[records,setRecords]=useState(null),[loading,setLoading]=useState(true),[loadingRecords,setLoadingRecords]=useState(false),[error,setError]=useState('');
 const [search,setSearch]=useState(''),[sex,setSex]=useState('all'),[timeline,setTimeline]=useState('all'),[status,setStatus]=useState('all'),[sort,setSort]=useState('name');
 const [selected,setSelected]=useState(null),[detail,setDetail]=useState(null),[detailLoading,setDetailLoading]=useState(false),[detailError,setDetailError]=useState('');
 useEffect(()=>{let active=true;setLoading(true);setError('');api('coordinator_setup').then(data=>{if(active){setCatalog(data);setLoading(false);}}).catch(e=>{if(active){setError(e.message);setLoading(false);}});return()=>{active=false;};},[api,refreshKey]);
 const years=useMemo(()=>catalog?.years||[],[catalog]);
 const sections=useMemo(()=>(catalog?.sections||[]).filter(item=>!item.deletedAt&&(item.yearInsertions||[]).some(insertion=>String(insertion.startYear)===year)),[catalog,year]);
 useEffect(()=>{if(year&&!years.some(item=>String(item.startYear)===year)){setYear('');setSection('');}},[year,years]);
 useEffect(()=>{if(section&&!sections.some(item=>item.id===section))setSection('');},[section,sections]);
 useEffect(()=>{setRecords(null);setError('');if(!year||!section)return;let active=true;setLoadingRecords(true);api('coordinator_learner_records',{query:'&start_year='+encodeURIComponent(year)+'&section_id='+encodeURIComponent(section)}).then(data=>{if(active){setRecords(data);setLoadingRecords(false);}}).catch(e=>{if(active){setError(e.message);setLoadingRecords(false);}});return()=>{active=false;};},[api,year,section,refreshKey]);
 useEffect(()=>{if(!selected)return;let active=true;setDetail(null);setDetailError('');setDetailLoading(true);api('coordinator_learner_result',{query:'&start_year='+encodeURIComponent(year)+'&section_id='+encodeURIComponent(section)+'&learner_id='+encodeURIComponent(selected.id)}).then(data=>{if(active){setDetail(data);setDetailLoading(false);}}).catch(e=>{if(active){setDetailError(e.message);setDetailLoading(false);}});return()=>{active=false;};},[selected,api,year,section]);
 const resetFilters=()=>{setSearch('');setSex('all');setTimeline('all');setStatus('all');setSort('name');};
 const filtered=useMemo(()=>{
  const q=search.trim().toLowerCase();
  return (records?.learners||[]).filter(learner=>{
   if(q&&!fullName(learner).toLowerCase().includes(q)&&!String(learner.lrn).includes(q))return false;
   if(sex!=='all'&&String(learner.sex||'').toLowerCase()!==sex)return false;
   const periods=timeline==='all'?PERIODS:[timeline],has=periods.some(p=>completedFor(learner,p));
   if(status==='assessed'&&!has)return false;
   if(status==='unassessed'&&has)return false;
   return true;
  }).sort((a,b)=>sort==='lrn'?String(a.lrn).localeCompare(String(b.lrn)):fullName(a).localeCompare(fullName(b)));
 },[records,search,sex,timeline,status,sort]);
 return <section className={styles.panel} aria-label="Learner Records">
  <h2>Learner Records</h2>
  <div className={styles.learnerRecordScope}>
   <label>School year<Select value={year} disabled={loading} onChange={e=>{setYear(e.target.value);setSection('');setSelected(null);resetFilters();}}><option value="" hidden disabled>Select school year</option>{years.map(item=><option key={item.startYear} value={item.startYear}>{item.label}</option>)}</Select></label>
   <label>Section<Select value={section} disabled={!year||loading||!sections.length} onChange={e=>{setSection(e.target.value);setSelected(null);resetFilters();}}><option value="" hidden disabled>Select section</option>{sections.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</Select></label>
  </div>
  {error?<p role="alert" className={styles.error}>{error}</p>:null}
  {loading?<WorkspaceLoading label="Loading school years and sections…" variant="years"/>:!year?<div className={styles.learnerRecordsPrompt}><strong>Select a school year and section</strong><p>Choose both options above to view learner information and assessment results.</p></div>:!sections.length?<div className={styles.learnerRecordsPrompt}><strong>No sections assigned for this school year</strong><p>There are no sections assigned to this school year yet. Choose another school year to view learner records.</p></div>:!section?<div className={styles.learnerRecordsPrompt}><strong>Select a section</strong><p>Choose a section above to view its enrolled learners and assessment results.</p></div>:loadingRecords?<WorkspaceLoading label="Loading learner records…" variant="records"/>:records?<>
   <div className={styles.learnerRecordHeading}><div><strong>{records.section}</strong><span>School Year {year}–{Number(year)+1}</span></div><div className={styles.assignedTeacherSummary}><strong>Assigned teacher: {records.assignedTeacherName||'No assigned teacher'}</strong><span>{records.learners.length} enrolled learner{records.learners.length===1?'':'s'}</span></div></div>
   {!records.learners.length?<div className={styles.learnerRecordsPrompt}><strong>{records.assignedTeacherName?'No learners enrolled in this section yet':'No teacher or learners assigned yet'}</strong><p>{records.assignedTeacherName?`${records.assignedTeacherName} is assigned to this section, but no learners have been enrolled yet.`:'This section has no assigned teacher and no enrolled learners yet.'}</p></div>:<>
   {!records.assignedTeacherName?<p role="status" className={styles.learnerRecordsNotice}>No teacher is assigned to this section yet. Existing learners are shown below.</p>:null}
   <div className={styles.learnerRecordFilters}>
    <input type="search" aria-label="Search learner name or LRN" placeholder="Search name or LRN" value={search} onChange={e=>setSearch(e.target.value)}/>
    <Select aria-label="Filter by sex" value={sex} onChange={e=>setSex(e.target.value)}><option value="all">All learners</option><option value="male">Male</option><option value="female">Female</option></Select>
    <Select aria-label="Filter by assessment timeline" value={timeline} onChange={e=>setTimeline(e.target.value)}><option value="all">All timelines</option>{PERIODS.map(p=><option key={p}>{p}</option>)}</Select>
    <Select aria-label="Filter by assessment status" value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All statuses</option><option value="assessed">Assessed</option><option value="unassessed">Not assessed</option></Select>
    <Select aria-label="Sort learner records" value={sort} onChange={e=>setSort(e.target.value)}><option value="name">Name A–Z</option><option value="lrn">LRN</option></Select>
   </div>
   <div className={styles.learnerRecordTableWrap}><table className={styles.learnerRecordTable}><thead><tr><th>Learner</th><th>LRN</th><th>Sex</th><th>Teacher</th>{PERIODS.map(p=><th key={p}>{p}</th>)}<th>Results</th></tr></thead><tbody>{filtered.map(learner=><tr key={learner.id}><td><strong>{fullName(learner)}</strong></td><td>{learner.lrn}</td><td>{valueOrDash(learner.sex)}</td><td>{valueOrDash(learner.teacherName)}</td>{PERIODS.map(p=>{const a=completedFor(learner,p);return <td key={p}>{a?<span className={styles.learnerRecorded}>Completed</span>:<span className={styles.learnerNotRecorded}>Not assessed</span>}</td>})}<td><button type="button" className={styles.learnerViewButton} onClick={()=>setSelected(learner)}>View</button></td></tr>)}</tbody></table>{!filtered.length?<p className={styles.learnerRecordsNoMatch}>{records.learners.length?'No learners match these filters.':'No learners enrolled in this section.'}</p>:null}</div>
   </>}
  </>:null}
  {selected?<IndividualResults key={selected.id} learner={detail?.learner} scope={detail?.printScope} loading={detailLoading} error={detailError} onClose={()=>setSelected(null)}/>:null}
 </section>;
}
