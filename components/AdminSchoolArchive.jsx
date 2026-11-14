'use client';
import {Fragment,useEffect,useRef,useState} from 'react';
import SchoolSections from './SchoolSections';
import ClassDialog from './ClassDialog';
import {auditDate} from './AuditDetailsDialog';
import {useArchiveNow} from './ArchiveRetention';
import {archiveRetentionLabel} from '../lib/archiveRetention.mjs';
import styles from './Coordinator.module.css';
import evidence from './AuditDetails.module.css';
const base='/api/access?role=admin&action=school_archive';
async function read(query=''){
 const response=await fetch(base+query,{cache:'no-store'}),result=await response.json();
 if(!response.ok)throw Error(result.error||'Unable to load Archive.');return result;
}
const metricLabels={task1Score:'Letter sounds',task2Score:'Word recognition',comprehensionScore:'Comprehension',totalMiscues:'Total miscues',miscueAccuracy:'Reading accuracy (%)',timerSeconds:'Reading time (seconds)',classificationLabel:'Reading profile',remarks:'Remarks'};
export function ArchivedLearnerEvidence({learner}){
 return <article className="admin-detail"><h3>{[learner.lastName,learner.firstName,learner.middleName,learner.suffix].filter(Boolean).join(', ')}</h3><p>LRN: {learner.lrn} · Sex: {learner.sex||'Not recorded'}</p>
 {learner.assessmentSessions?.length?learner.assessmentSessions.map(session=><details key={session.id}><summary>{session.assessmentPeriod} · {session.overallClassification||'Unclassified'} · {session.isCompleted?'Completed':'Incomplete'}</summary><p>{auditDate(session.dateAdministered)}</p><dl className="admin-facts">{Object.entries(metricLabels).filter(([key])=>session.sessionMetrics?.[key]!=null).map(([key,label])=><Fragment key={key}><dt>{label}</dt><dd>{String(session.sessionMetrics[key])}</dd></Fragment>)}</dl>
 {['letterResults','wordResults','passageMiscues','comprehensionResults'].map(key=><div key={key}>{session[key]?.length>0&&<><strong>{{letterResults:'Letter sounds',wordResults:'Words',passageMiscues:'Passage miscues',comprehensionResults:'Comprehension questions'}[key]}</strong><ul>{session[key].map((item,index)=><li key={item.id||index}>{key==='passageMiscues'?`Word ${item.wordIndex+1}: ${item.miscueType}${item.misreadWord?' · '+item.misreadWord:''}`:`${item.letter||item.word||'Question '+(item.questionIndex+1)}: ${item.isCorrect?'Correct':'Incorrect'}`}</li>)}</ul></>}</div>)}
 </details>):<p>No assessment results recorded for this school year.</p>}</article>;
}
export default function AdminSchoolArchive({refreshToken}){
 const [data,setData]=useState(null),[error,setError]=useState(''),[dialog,setDialog]=useState(null),[search,setSearch]=useState('');
 const requests=useRef(0),listRequests=useRef(0);
 const clock=useArchiveNow(data?.years||[],data?.serverNow,data?.receivedAt);
 const years=(data?.years||[]).filter(year=>Date.parse(year.expiresAt)>clock);
 useEffect(()=>{const request=++listRequests.current;requests.current++;setDialog(null);setData(null);setError('');read().then(result=>{if(request===listRequests.current)setData({...result,receivedAt:Date.now()});}).catch(e=>{if(request===listRequests.current)setError(e.message);});return()=>{listRequests.current++;requests.current++;};},[refreshToken]);
 const close=()=>{requests.current++;setDialog(null);};
 const open=async(year,section=null,page=0)=>{
  const request=++requests.current;
  setDialog({year,section,page,loading:true});
  try{const result=await read(`&start_year=${year.startYear}${section?'&archive_id='+encodeURIComponent(section.id)+'&page='+page:''}`);if(request===requests.current)setDialog({...result,loading:false});}
  catch(e){if(request===requests.current)setDialog({year,section,page,error:e.message});}
 };
 const download=async()=>{
  const request=requests.current;setDialog(current=>({...current,downloading:true,error:''}));
  try{const result=await read(`&start_year=${dialog.year.startYear}&archive_id=${encodeURIComponent(dialog.section.id)}&download=1`);if(request!==requests.current)return;
   const url=URL.createObjectURL(new Blob([JSON.stringify(result.backup)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=result.filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  }catch(e){if(request===requests.current)setDialog(current=>({...current,error:e.message}));}finally{if(request===requests.current)setDialog(current=>({...current,downloading:false}));}
 };
 const query=search.trim().toLowerCase();
 return <section className={styles.root}><section className={styles.panel}><div className={styles.contentHeading}><h2>Archive</h2></div><p>School years and sections are retained for 30 days. A school-year archive keeps its original learner information and assessment results; reusable section definitions remain available.</p>
 {error&&<p role="alert" className={styles.error}>{error}</p>}{!data&&!error&&<p role="status">Loading archived school years…</p>}
 {years.length>0&&<><input type="search" aria-label="Search archived school years" placeholder="Search school year" value={search} onChange={e=>setSearch(e.target.value)}/><div className={styles.yearList}>{years.filter(row=>row.label.includes(query)).map(year=><article key={year.startYear} className={styles.yearRow}><div><strong>School Year {year.label}</strong><p>{year.sectionCount} sections · {year.learnerCount} learners</p><p>Archived {auditDate(year.deletedAt)} · {archiveRetentionLabel(year,clock)}</p></div><button className={styles.secondary} onClick={()=>open(year)}>View</button></article>)}</div></>}
 {data&&!years.length&&<p>No archived school years.</p>}</section><SchoolSections refreshToken={refreshToken} view="deleted" hideHeading/>
 {dialog&&<ClassDialog title={`School Year ${dialog.year.label}`} wide showClose onClose={close}><div className={evidence.body}>
 {dialog.section&&<div className={styles.toolbar}><button onClick={()=>open(dialog.year)}>Back to school year</button><button disabled={dialog.loading||dialog.downloading||!dialog.learners} onClick={download}>{dialog.downloading?'Please wait…':'Download section backup'}</button></div>}
 {dialog.loading?<p role="status">Loading archived records…</p>:dialog.error?<div role="alert"><p>{dialog.error}</p><button onClick={()=>open(dialog.year,dialog.section,dialog.page)}>Retry</button></div>:dialog.section?<><h3>Section: {dialog.section.name}</h3><p>These records belong to School Year {dialog.year.label}.</p>{dialog.learners.map(learner=><ArchivedLearnerEvidence key={learner.id} learner={learner}/>)}{!dialog.learners.length&&<p>No learners were enrolled in this section.</p>}{dialog.total>25&&<div className={styles.toolbar}><button disabled={dialog.page===0} onClick={()=>open(dialog.year,dialog.section,dialog.page-1)}>Previous</button><span>{dialog.page*25+1}–{Math.min((dialog.page+1)*25,dialog.total)} of {dialog.total}</span><button disabled={(dialog.page+1)*25>=dialog.total} onClick={()=>open(dialog.year,dialog.section,dialog.page+1)}>Next</button></div>}</>:<>{dialog.sections.map((section,index)=><article className="admin-detail" key={section.id||index}><h3>{section.name}</h3><p>{section.teacherName?'Teacher: '+section.teacherName:'No saved teacher assignment'}</p>{section.id?<><p>{section.learnerCount} learners</p><button onClick={()=>open(dialog.year,section)}>View learners and results</button></>:<p>No learner snapshot was recorded for this section.</p>}</article>)}{!dialog.sections.length&&<p>No sections were included in this school year.</p>}</>}
 <footer><button onClick={close}>Close</button></footer></div></ClassDialog>}
 </section>;
}
