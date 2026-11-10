'use client';

import {useEffect,useMemo,useRef,useState} from 'react';
import Select from './Select';
import ClassDialog from './ClassDialog';
import WorkspaceLoading from './WorkspaceLoading';
import AssessmentRecordViews from './AssessmentRecordViews';
import {coordinatorRecordData} from '../lib/coordinatorRecordData.mjs';
import {rosterRecords} from '../lib/rosterRecords.mjs';
import {buildScoresheetHeader,buildClassSummaryRows} from '../lib/recordViewModel.mjs';
import styles from './Coordinator.module.css';

const PERIODS=['BoSY','MoSY','EoSY'];
const date=value=>value?new Intl.DateTimeFormat('en-PH',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Manila'}).format(new Date(value)):'Not recorded';
const valueOrDash=value=>value===null||value===undefined||value===''?'Not recorded':String(value);
const latest=(learner,period)=>(learner.assessments||[]).filter(row=>row.period===period).sort((a,b)=>new Date(b.date)-new Date(a.date)||b.id-a.id)[0]||null;
const resultState=row=>!row?'Not assessed':row.completed?'Completed':'Incomplete';
function Fact({name,value}){return <div className={styles.learnerResultFact}><dt>{name}</dt><dd>{valueOrDash(value)}</dd></div>;}
function ResponseList({title,rows,indexKey,label,detail}){
 return <section className={styles.learnerResponseGroup}><h4>{title} <small>({rows?.length||0})</small></h4>
  {!rows?.length?<p>No recorded responses for this task.</p>:
   <div className={styles.learnerResponseGrid}>{rows.map((row,i)=><div key={row.id||i} className={styles.learnerResponseRow}>
    <strong>{label(row,indexKey)} {detail(row)}</strong>
    <span className={row.isCorrect===true?styles.responseCorrect:row.isCorrect===false?styles.responseIncorrect:styles.responseNeutral}>
     {row.isCorrect===true?'Correct':row.isCorrect===false?'Incorrect':'Recorded'}
    </span>
   </div>)}</div>}</section>;
}
function LearnerResultDialog({learnerId,report,api,onClose}){
 const [loading,setLoading]=useState(true),[result,setResult]=useState(null),[error,setError]=useState(''),[period,setPeriod]=useState('BoSY'),[attemptId,setAttemptId]=useState('');
 useEffect(()=>{let cancelled=false;setResult(null);setLoading(true);setError('');setPeriod('BoSY');setAttemptId('');
  api('coordinator_learner_record_detail',{query:'&start_year='+report.startYear+'&school_section_id='+encodeURIComponent(report.sectionId)+'&learner_id='+learnerId})
   .then(data=>{if(!cancelled){setResult(data.learner);setLoading(false);}})
   .catch(err=>{if(!cancelled){setLoading(false);setError(err.message||'Unable to load this learner record.');}});
  return()=>{cancelled=true;};
 },[api,learnerId,report.startYear,report.sectionId]);
 const attempts=(result?.assessments||[]).filter(a=>a.period===period).sort((a,b)=>new Date(b.date)-new Date(a.date)||b.id-a.id);
 const session=attempts.find(a=>String(a.id)===attemptId)||attempts[0]||null;
 const metrics=session?.metrics||null;
 return <ClassDialog wide title="Learner assessment results" showClose onClose={onClose}>
  <div className={styles.learnerDetail}>
   {loading?<WorkspaceLoading label="Loading learner assessment details…" variant="records"/>:error?<p className={styles.error} role="alert">{error}</p>:result&&<>
    <div className={styles.learnerDetailIdentity}><h3>{result.fullName}</h3><p>LRN {result.lrn} · {report.section} · SY {report.year}</p>
      <small>{result.teacherName||'No assigned teacher'}{result.unassigned?' (unassigned)':''}</small></div>
    <div className={styles.segmented} role="group" aria-label="Learner assessment timeline">
     {PERIODS.map(item=><button type="button" key={item} aria-pressed={period===item} onClick={()=>{setPeriod(item);setAttemptId('');}}>{item}</button>)}
    </div>
    {!session?<div className={styles.learnerResultEmpty}>No {period} assessment results have been recorded for this learner.</div>:<>
     {attempts.length>1&&<label className={styles.learnerAttemptSelect}>Assessment attempt
      <Select aria-label="Assessment attempt" value={String(session.id)} onChange={e=>setAttemptId(e.target.value)}>
       {attempts.map(item=><option key={item.id} value={item.id}>{date(item.date)} · {resultState(item)} · #{item.id}</option>)}
      </Select></label>}
     <div className={styles.learnerDetailStatus}><strong>{period} · {resultState(session)}</strong><span>{date(session.date)}</span></div>
     <dl className={styles.learnerResultFacts}>
      <Fact name="Reading classification" value={session.classification}/>
      <Fact name="Part 1: Letter sounds" value={metrics?.task1Score==null?null:String(metrics.task1Score)+' / 10'}/>
      <Fact name="Part 1: Word reading" value={metrics?.task2Score==null?null:String(metrics.task2Score)+' / 10'}/>
      <Fact name="Part 2: Comprehension" value={metrics?.comprehensionScore==null?null:String(metrics.comprehensionScore)+' / 6'}/>
      <Fact name="Reading accuracy" value={metrics?.miscueAccuracy==null?null:String(metrics.miscueAccuracy)+'%'}/>
      <Fact name="Total miscues" value={metrics?.totalMiscues}/>
      <Fact name="Reading time" value={metrics?.timerSeconds==null?null:String(metrics.timerSeconds)+' seconds'}/>
      <Fact name="Reading passage" value={session.storyTitle}/>
      <Fact name="Observation level" value={metrics?.observationLevel}/>
      <Fact name="Classification label" value={metrics?.classificationLabel}/>
      <Fact name="Experience rating" value={metrics?.experienceRating}/>
     </dl>
     <ResponseList title="Letter-sound responses" rows={session.letters} indexKey="letterIndex" label={r=>'Letter '+(r.letterIndex+1)+':'} detail={r=>r.letter||'—'}/>
     <ResponseList title="Word-reading responses" rows={session.words} indexKey="wordIndex" label={r=>'Word '+(r.wordIndex+1)+':'} detail={r=>r.word||'—'}/>
     <section className={styles.learnerResponseGroup}><h4>Passage miscues <small>({session.miscues?.length||0})</small></h4>
      {session.miscues?.length?<div className={styles.learnerResponseGrid}>{session.miscues.map((r,i)=><div key={r.id||i} className={styles.learnerResponseRow}>
       <strong>Word position {r.wordIndex+1}</strong><span>{String(r.miscueType||'Miscue').replaceAll('_',' ')}{r.misreadWord?' · '+r.misreadWord:''}</span></div>)}</div>:<p>No individual passage miscues recorded.</p>}</section>
     <ResponseList title="Comprehension responses" rows={session.comprehension} indexKey="questionIndex" label={r=>'Question '+(r.questionIndex+1)+':'} detail={()=>''}/>
     {metrics?.remarks&&<section className={styles.learnerRemarks}><h4>Teacher remarks</h4><p>{metrics.remarks}</p></section>}
    </>}
   </>}
   <div className={styles.learnerDialogFooter}><button type="button" className={styles.secondary} onClick={onClose}>Close</button></div>
  </div>
 </ClassDialog>;
}
export default function CoordinatorLearnerRecords({api,refreshKey=0}){
 const [catalog,setCatalog]=useState(null),[year,setYear]=useState(''),[sectionId,setSectionId]=useState(''),
 [report,setReport]=useState(null),[catalogLoading,setCatalogLoading]=useState(true),[recordsLoading,setRecordsLoading]=useState(false),
 [error,setError]=useState(''),[search,setSearch]=useState(''),[periodFilter,setPeriodFilter]=useState('all'),
 [statusFilter,setStatusFilter]=useState('all'),[sort,setSort]=useState('asc'),[view,setView]=useState('list'),
 [workbookPeriod,setWorkbookPeriod]=useState('BoSY'),[zoom,setZoom]=useState(1),[detailLearner,setDetailLearner]=useState(null);
 const token=useRef(0);
 useEffect(()=>{let cancelled=false;setCatalogLoading(true);setError('');
  api('coordinator_learner_record_catalog').then(data=>{if(!cancelled){setCatalog(data);setCatalogLoading(false);}})
  .catch(err=>{if(!cancelled){setCatalogLoading(false);setError(err.message);}});
  return()=>{cancelled=true;};
 },[api,refreshKey]);
 const sections=(catalog?.sections||[]).filter(row=>String(row.startYear)===year);
 useEffect(()=>{if(!catalog)return;
  if(year&&!catalog.years.some(item=>String(item.startYear)===year)){setYear('');setSectionId('');setReport(null);}
  else if(sectionId&&!sections.some(item=>item.id===sectionId)){setSectionId('');setReport(null);}
 },[catalog,year,sectionId]);
 useEffect(()=>{const id=++token.current;setReport(null);setDetailLearner(null);setError('');
  if(!year||!sectionId){setRecordsLoading(false);return;}
  setRecordsLoading(true);
  api('coordinator_learner_record_list',{query:'&start_year='+year+'&school_section_id='+encodeURIComponent(sectionId)})
   .then(data=>{if(id===token.current)setReport({...data,sectionId});})
   .catch(err=>{if(id===token.current)setError(err.message||'Unable to load learner records.');})
   .finally(()=>{if(id===token.current)setRecordsLoading(false);});
  return()=>{token.current++;};
 },[api,year,sectionId,refreshKey]);
 const learners=report?.learners||[];
 const visible=useMemo(()=>learners.filter(row=>{
  const term=search.trim().toLowerCase();
  if(term&&!(row.fullName+' '+row.lrn+' '+(row.teacherName||'')).toLowerCase().includes(term))return false;
  if(periodFilter!=='all'){
   const a=latest(row,periodFilter);
   if(statusFilter==='completed'&&!a?.completed)return false;
   if(statusFilter==='incomplete'&&(!a||a.completed))return false;
   if(statusFilter==='not-assessed'&&a)return false;
  }else{
   const has=(row.assessments||[]).some(a=>a.completed);
   if(statusFilter==='completed'&&!has)return false;
   if(statusFilter==='incomplete'&&!(row.assessments||[]).some(a=>!a.completed))return false;
   if(statusFilter==='not-assessed'&&(row.assessments||[]).length)return false;
  }
  return true;
 }).sort((a,b)=>(sort==='desc'?-1:1)*(a.lastName.localeCompare(b.lastName)||a.firstName.localeCompare(b.firstName)||a.id-b.id)),[learners,search,periodFilter,statusFilter,sort]);
 const workbook=useMemo(()=>report?coordinatorRecordData({learners:report.learners}):{learners:[],assessments:[]},[report]);
 const records=useMemo(()=>rosterRecords(workbook.learners,workbook.assessments,workbookPeriod),[workbook,workbookPeriod]);
 const scoresheetHeader=useMemo(()=>buildScoresheetHeader(workbook.learners,records),[workbook,records]);
 const classSummaryRows=useMemo(()=>buildClassSummaryRows(workbook.learners,records),[workbook,records]);
 const recordOwners=useMemo(()=>[...new Set(learners.map(row=>row.teacherName).filter(Boolean))],[learners]);
 const summaryTeacher=recordOwners.length===1?recordOwners[0]:recordOwners.length?'Multiple teachers':'—';
 return <div className={styles.coordinatorLearnerRecords}>
  <section className={styles.panel}>
   <h2>Learner Records</h2>
   <p className={styles.coordinatorRecordsHint}>Choose a school year and section to view learners and their recorded assessments.</p>
   <div className={styles.coordinatorRecordScope}>
    <label>School year
     <Select aria-label="Learner records school year" value={year} disabled={catalogLoading} onChange={e=>{setYear(e.target.value);setSectionId('');setView('list');setSearch('');}}>
      <option value="">Select school year</option>{(catalog?.years||[]).map(item=><option key={item.startYear} value={item.startYear}>{item.label}</option>)}
     </Select>
    </label>
    <label>Section
     <Select aria-label="Learner records section" value={sectionId} disabled={catalogLoading||!year} onChange={e=>{setSectionId(e.target.value);setView('list');setSearch('');}}>
      <option value="">Select section</option>{sections.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
     </Select>
    </label>
   </div>
  </section>
  {error&&<p className={styles.error} role="alert">{error}</p>}
  {catalogLoading?<WorkspaceLoading label="Loading school years and sections…" variant="years"/>:
  !year||!sectionId?<section className={styles.coordinatorRecordsEmpty} role="status">
    <strong>Select a school year and section</strong>
    <p>Choose both dropdowns above to view learner records and assessment results.</p>
   </section>:
  recordsLoading?<WorkspaceLoading label="Loading learner records…" variant="records"/>:
  report&&<section className={styles.panel}>
   <div className={styles.coordinatorRecordsTitle}><div><h2>{report.section} · SY {report.year}</h2><p>{learners.length} learner{learners.length===1?'':'s'} enrolled · Read-only records</p></div></div>
   <div className={styles.coordinatorRecordViews} role="group" aria-label="Learner record view">
    {[[ 'list','Learner List'],['scoresheet','Scoresheet'],['summary','Class Summary'],['class-record','Class Record']].map(([id,title])=><button type="button" key={id} aria-pressed={view===id} onClick={()=>setView(id)}>{title}</button>)}
   </div>
   {view==='list'?<>
    <div className={styles.coordinatorRecordFilters}>
     <label>Search learners<input type="search" aria-label="Search learner records" placeholder="Name, LRN or teacher" value={search} onChange={e=>setSearch(e.target.value)}/></label>
     <label>Timeline<Select aria-label="Filter learner records by timeline" value={periodFilter} onChange={e=>setPeriodFilter(e.target.value)}><option value="all">All timelines</option>{PERIODS.map(p=><option key={p} value={p}>{p}</option>)}</Select></label>
     <label>Status<Select aria-label="Filter learner records by status" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="all">All statuses</option><option value="completed">Completed</option><option value="incomplete">Incomplete</option><option value="not-assessed">Not assessed</option></Select></label>
     <label>Sort<Select aria-label="Sort learner records" value={sort} onChange={e=>setSort(e.target.value)}><option value="asc">Name (A–Z)</option><option value="desc">Name (Z–A)</option></Select></label>
    </div>
    <p className={styles.coordinatorRecordCount}>{visible.length} of {learners.length} learners shown</p>
    <div className={styles.coordinatorLearnerTableScroll}><table className={styles.coordinatorLearnerTable}>
     <thead><tr><th>Learner</th><th>LRN</th><th>Sex</th><th>Teacher</th>{PERIODS.map(p=><th key={p}>{p}</th>)}<th>Results</th></tr></thead>
     <tbody>{visible.map(row=><tr key={row.id}><td><strong>{row.fullName}</strong></td><td>{row.lrn}</td><td>{row.sex||'—'}</td><td>{row.teacherName||'—'}{row.unassigned?' (unassigned)':''}</td>
      {PERIODS.map(p=><td key={p}><span className={styles.coordinatorRecordState} data-state={resultState(latest(row,p))}>{resultState(latest(row,p))}</span></td>)}
      <td><button type="button" className={styles.coordinatorRecordViewButton} onClick={()=>setDetailLearner(row.id)}>View</button></td>
     </tr>)}</tbody>
    </table>{!visible.length&&<p className={styles.coordinatorRecordsNoResults}>{learners.length?'No learners match these filters.':'No learners are enrolled in this section yet.'}</p>}</div>
   </>:<>
    <div className={styles.coordinatorRecordPeriod} role="group" aria-label="Workbook assessment timeline">{PERIODS.map(p=><button type="button" key={p} aria-pressed={workbookPeriod===p} onClick={()=>setWorkbookPeriod(p)}>{p}</button>)}</div>
    <AssessmentRecordViews readOnly recordsView={view} currentRecords={records} currentPeriod={workbookPeriod} learners={workbook.learners}
     selectedClass={{name:report.section}} user={{full_name:summaryTeacher,school_name:'',school_id:''}} classSummaryRows={classSummaryRows}
     scoresheetHeader={scoresheetHeader} scoresheetZoom={zoom} setScoresheetZoom={setZoom} scoresheetMode="view" classReadonly/>
   </>}
  </section>}
  {detailLearner&&report&&<LearnerResultDialog learnerId={detailLearner} report={report} api={api} onClose={()=>setDetailLearner(null)}/>}
 </div>;
}
