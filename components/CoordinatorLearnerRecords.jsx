'use client';
import {useEffect,useMemo,useState} from 'react';
import ClassDialog from './ClassDialog';
import Select from './Select';
import WorkspaceLoading from './WorkspaceLoading';
import styles from './Coordinator.module.css';
const PERIODS=['BoSY','MoSY','EoSY'];
const fullName=learner=>[learner.lastName+',',learner.firstName,learner.middleName,learner.suffix].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
const completedFor=(learner,period)=>(learner.assessments||[]).filter(a=>a.assessmentPeriod===period).sort((a,b)=>new Date(b.dateAdministered)-new Date(a.dateAdministered)||b.id-a.id)[0]||null;
const displayDate=value=>value?new Date(value).toLocaleDateString('en-PH',{year:'numeric',month:'short',day:'numeric',timeZone:'Asia/Manila'}):'—';
const valueOrDash=value=>value===null||value===undefined||value===''?'—':String(value);
function Evidence({heading,rows,render}){
 return <section className={styles.learnerEvidenceSection}><h4>{heading}</h4>{!rows?.length?<p className={styles.empty}>No recorded items.</p>:<div className={styles.learnerEvidenceGrid}>{rows.map((item,index)=><div className={styles.learnerEvidenceItem} key={item.id||index}>{render(item,index)}</div>)}</div>}</section>;
}
function IndividualResults({learner,loading,error,onClose}){
 const [period,setPeriod]=useState('BoSY');
 const results=learner?.assessmentSessions||[];
 const session=results.find(s=>s.assessmentPeriod===period);
 const metrics=session?.sessionMetrics;
 return <ClassDialog title="Individual assessment results" showClose onClose={onClose}>
  <div className={styles.learnerResultDetail}>
   {loading?<WorkspaceLoading label="Loading assessment results…" variant="records"/>:error?<p role="alert" className={styles.error}>{error}</p>:learner?<>
    <div className={styles.learnerResultIdentity}><strong>{fullName(learner)}</strong><span>LRN: {learner.lrn}</span><small>Recorded results are view-only.</small></div>
    <div className={styles.learnerPeriodTabs} role="group" aria-label="Individual assessment timeline">{PERIODS.map(p=><button key={p} type="button" aria-pressed={period===p} onClick={()=>setPeriod(p)}>{p}</button>)}</div>
    {!session?<p className={styles.learnerNoResult}>No completed {period} assessment for this learner.</p>:<>
      <div className={styles.learnerResultMetrics}>
       <div><span>Assessment date</span><strong>{displayDate(session.dateAdministered)}</strong></div>
       <div><span>Reading profile</span><strong>{valueOrDash(session.overallClassification||metrics?.classificationLabel)}</strong></div>
       <div><span>Letter sounds</span><strong>{valueOrDash(metrics?.task1Score)} / 10</strong></div>
       <div><span>Word reading</span><strong>{valueOrDash(metrics?.task2Score)} / 10</strong></div>
       <div><span>Comprehension</span><strong>{valueOrDash(metrics?.comprehensionScore)} / 6</strong></div>
       <div><span>Reading accuracy</span><strong>{metrics?.miscueAccuracy===null||metrics?.miscueAccuracy===undefined?'—':Number(metrics.miscueAccuracy).toFixed(2)+'%'}</strong></div>
       <div><span>Total miscues</span><strong>{valueOrDash(metrics?.totalMiscues)}</strong></div>
       <div><span>Reading time</span><strong>{metrics?.timerSeconds==null?'—':metrics.timerSeconds+' seconds'}</strong></div>
       <div><span>Story</span><strong>{valueOrDash(session.storyTitle)}</strong></div>
       <div><span>Observation level</span><strong>{valueOrDash(metrics?.observationLevel)}</strong></div>
       <div><span>Experience rating</span><strong>{valueOrDash(metrics?.experienceRating)}</strong></div>
      </div>
      <Evidence heading="Letter-sound responses" rows={session.letterResults} render={(item)=><><span>{item.letter} · Item {item.letterIndex+1}</span><strong data-correct={item.isCorrect}>{item.isCorrect?'Correct':'Incorrect'}</strong></>}/>
      <Evidence heading="Word-reading responses" rows={session.wordResults} render={(item)=><><span>{item.word} · Item {item.wordIndex+1}</span><strong data-correct={item.isCorrect}>{item.isCorrect?'Correct':'Incorrect'}</strong></>}/>
      <Evidence heading="Passage-reading miscues" rows={session.passageMiscues} render={(item)=><><span>Word {item.wordIndex+1} · {String(item.miscueType).replace(/_/g,' ')}</span><strong>{item.misreadWord?'Read as: '+item.misreadWord:'No spoken replacement recorded'}</strong></>}/>
      <Evidence heading="Comprehension answers" rows={session.comprehensionResults} render={(item)=><><span>Question {item.questionIndex+1}</span><strong data-correct={item.isCorrect}>{item.isCorrect?'Correct':'Incorrect'}</strong></>}/>
      {metrics?.remarks?<section className={styles.learnerEvidenceSection}><h4>Teacher remarks</h4><p>{metrics.remarks}</p></section>:null}
     </>}
   </>:null}
   <div className={styles.learnerResultClose}><button type="button" onClick={onClose}>Close</button></div>
  </div>
 </ClassDialog>;
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
 useEffect(()=>{if(!selected)return;let active=true;setDetail(null);setDetailError('');setDetailLoading(true);api('coordinator_learner_result',{query:'&start_year='+encodeURIComponent(year)+'&section_id='+encodeURIComponent(section)+'&learner_id='+encodeURIComponent(selected.id)}).then(data=>{if(active){setDetail(data.learner);setDetailLoading(false);}}).catch(e=>{if(active){setDetailError(e.message);setDetailLoading(false);}});return()=>{active=false;};},[selected,api,year,section]);
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
   <label>School year<Select value={year} disabled={loading} onChange={e=>{setYear(e.target.value);setSection('');setSelected(null);}}><option value="">Select school year</option>{years.map(item=><option key={item.startYear} value={item.startYear}>{item.label}</option>)}</Select></label>
   <label>Section<Select value={section} disabled={!year||loading} onChange={e=>{setSection(e.target.value);setSelected(null);}}><option value="">Select section</option>{sections.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</Select></label>
  </div>
  {error?<p role="alert" className={styles.error}>{error}</p>:null}
  {loading?<WorkspaceLoading label="Loading school years and sections…" variant="years"/>:!year||!section?<div className={styles.learnerRecordsPrompt}><strong>Select a school year and section</strong><p>Choose both options above to view learner information and assessment results.</p></div>:loadingRecords?<WorkspaceLoading label="Loading learner records…" variant="records"/>:records?<>
   <div className={styles.learnerRecordHeading}><div><strong>{records.section}</strong><span>School Year {year}–{Number(year)+1}</span></div><span>{records.learners.length} enrolled learner{records.learners.length===1?'':'s'}</span></div>
   <div className={styles.learnerRecordFilters}>
    <input type="search" aria-label="Search learner name or LRN" placeholder="Search name or LRN" value={search} onChange={e=>setSearch(e.target.value)}/>
    <Select aria-label="Filter by sex" value={sex} onChange={e=>setSex(e.target.value)}><option value="all">All learners</option><option value="male">Male</option><option value="female">Female</option></Select>
    <Select aria-label="Filter by assessment timeline" value={timeline} onChange={e=>setTimeline(e.target.value)}><option value="all">All timelines</option>{PERIODS.map(p=><option key={p}>{p}</option>)}</Select>
    <Select aria-label="Filter by assessment status" value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All statuses</option><option value="assessed">Assessed</option><option value="unassessed">Not assessed</option></Select>
    <Select aria-label="Sort learner records" value={sort} onChange={e=>setSort(e.target.value)}><option value="name">Name A–Z</option><option value="lrn">LRN</option></Select>
   </div>
   <div className={styles.learnerRecordTableWrap}><table className={styles.learnerRecordTable}><thead><tr><th>Learner</th><th>LRN</th><th>Sex</th><th>Teacher</th>{PERIODS.map(p=><th key={p}>{p}</th>)}<th>Results</th></tr></thead><tbody>{filtered.map(learner=><tr key={learner.id}><td><strong>{fullName(learner)}</strong></td><td>{learner.lrn}</td><td>{valueOrDash(learner.sex)}</td><td>{valueOrDash(learner.teacherName)}</td>{PERIODS.map(p=>{const a=completedFor(learner,p);return <td key={p}>{a?<span className={styles.learnerRecorded}>Completed</span>:<span className={styles.learnerNotRecorded}>Not assessed</span>}</td>})}<td><button type="button" className={styles.learnerViewButton} onClick={()=>setSelected(learner)}>View</button></td></tr>)}</tbody></table>{!filtered.length?<p className={styles.learnerRecordsNoMatch}>{records.learners.length?'No learners match these filters.':'No learners enrolled in this section.'}</p>:null}</div>
  </>:null}
  {selected?<IndividualResults key={selected.id} learner={detail} loading={detailLoading} error={detailError} onClose={()=>setSelected(null)}/>:null}
 </section>;
}
