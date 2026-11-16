'use client';
import {Fragment,useCallback,useEffect,useRef,useState} from 'react';
import ClassDialog from './ClassDialog';
import Select from './Select';
import {auditDate} from './AuditDetailsDialog';
import {useArchiveNow} from './ArchiveRetention';
import {archiveRetentionLabel} from '../lib/archiveRetention.mjs';
import styles from './Coordinator.module.css';
import evidence from './AuditDetails.module.css';
import ui from './AdminSchoolArchive.module.css';
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
export function adminArchiveRecords(data){
 return [...(data?.years||[]).map(year=>({...year,kind:'school_year',key:'year:'+year.startYear,title:'School Year '+year.label})),...(data?.sections||[]).map(section=>({...section,kind:'section',key:'section:'+section.id,title:section.name}))];
}
export function AdminArchiveList({records,clock,search,onSearch,onView,onDelete,sort='newest',onSort,loading,busy}){
 const visible=records.filter(record=>Date.parse(record.expiresAt)>clock).filter(record=>record.title.toLowerCase().includes(search.trim().toLowerCase())).sort((a,b)=>(sort==='oldest'?1:-1)*(Date.parse(a.deletedAt)-Date.parse(b.deletedAt))||a.key.localeCompare(b.key));
 return <section className={`${styles.panel} ${ui.panel}`} aria-label="Archived school years and sections" aria-busy={loading}>
  <p className={ui.intro}>School years and sections are retained for 30 days.</p>
  <div className={ui.searchRow}><label className={ui.search}><span>Search</span><input type="search" aria-label="Search Archive" placeholder="Search school year or section" value={search} onChange={event=>onSearch(event.target.value)} disabled={loading||busy}/></label><label className={ui.sort}><span>Sort</span><Select value={sort} onChange={event=>onSort(event.target.value)} disabled={loading||busy}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></Select></label></div>
  {loading?<p role="status">Loading Archive…</p>:<div className={ui.list}>{visible.map(record=><article className={`${ui.row} ${record.kind==='school_year'?ui.schoolYear:ui.section}`} key={record.key}>
   <div className={ui.info}><span className={ui.type}>{record.kind==='school_year'?<><svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18"/></svg>School year</>:<><svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 9v12"/></svg>Section</>}</span>
    <h3>{record.title}</h3>{record.kind==='school_year'?<p>{record.sectionCount} sections · {record.learnerCount} learners</p>:<p>Reusable school section</p>}
    <p className={ui.meta}>Archived {auditDate(record.deletedAt)} · {archiveRetentionLabel(record,clock)}</p></div>
   <div className={ui.actions}><button type="button" disabled={busy} onClick={()=>onView(record)}>View Details</button><button type="button" className={styles.danger} disabled={busy} onClick={()=>onDelete(record)}>Delete</button></div>
  </article>)}{!visible.length&&<p className={ui.empty}>{records.some(record=>Date.parse(record.expiresAt)>clock)?'No archives match your search.':'No archived school years or sections.'}</p>}</div>}
 </section>;
}
const recordQuery=record=>record.kind==='school_year'?`&start_year=${record.startYear}`:`&section_id=${encodeURIComponent(record.id)}`;
export default function AdminSchoolArchive({refreshToken}){
 const [data,setData]=useState(null),[error,setError]=useState(''),[dialog,setDialog]=useState(null),[search,setSearch]=useState(''),[loading,setLoading]=useState(true);
 const [deletion,setDeletion]=useState(null),[deleting,setDeleting]=useState(false),[deleteError,setDeleteError]=useState(''),[password,setPassword]=useState(''),[sort,setSort]=useState('newest');
 const requests=useRef(0),listRequests=useRef(0),pendingDelete=useRef(false);
 const records=adminArchiveRecords(data),clock=useArchiveNow(records,data?.serverNow,data?.receivedAt);
 const load=useCallback(async()=>{const request=++listRequests.current;setLoading(true);setError('');try{const result=await read();if(request===listRequests.current)setData({...result,receivedAt:Date.now()});}catch(e){if(request===listRequests.current)setError(e.message);}finally{if(request===listRequests.current)setLoading(false);}},[]);
 useEffect(()=>{requests.current++;setDialog(null);setDeletion(null);setPassword('');void load();return()=>{listRequests.current++;requests.current++;};},[refreshToken,load]);
 const close=()=>{requests.current++;setDialog(null);};
 const open=async(record,member=null,page=0)=>{
  const request=++requests.current;setDialog({record,member,page,loading:true});
  try{const result=await read(recordQuery(record)+(member?'&archive_id='+encodeURIComponent(member.id)+'&page='+page:''));if(request===requests.current)setDialog({...result,record,member,loading:false});}
  catch(e){if(request===requests.current)setDialog({record,member,page,error:e.message});}
 };
 const download=async()=>{
  const request=requests.current;setDialog(current=>({...current,downloading:true,downloadError:''}));
  try{const result=await read(recordQuery(dialog.record)+`&archive_id=${encodeURIComponent(dialog.member.id)}&download=1`);if(request!==requests.current)return;
   const url=URL.createObjectURL(new Blob([JSON.stringify(result.backup)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=result.filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  }catch(e){if(request===requests.current)setDialog(current=>({...current,downloadError:e.message}));}finally{if(request===requests.current)setDialog(current=>({...current,downloading:false}));}
 };
 const deleteArchive=async event=>{
  event.preventDefault();if(pendingDelete.current||!deletion||!password)return;
  pendingDelete.current=true;setDeleting(true);setDeleteError('');
  try{const response=await fetch('/api/access?role=admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'purge_school_archive',kind:deletion.kind,start_year:deletion.startYear,section_id:deletion.id,expected_deleted_at:deletion.deletedAt,confirmation_password:password})}),result=await response.json();if(!response.ok)throw Error(result.error||'Unable to delete this archive.');setDeletion(null);setPassword('');setData(current=>({...current,years:(current?.years||[]).filter(row=>deletion.kind!=='school_year'||row.startYear!==deletion.startYear),sections:(current?.sections||[]).filter(row=>deletion.kind!=='section'||row.id!==deletion.id)}));await load();}
  catch(e){setDeleteError(e.message);}finally{pendingDelete.current=false;setDeleting(false);}
 };
 return <section className={styles.root}>
  {error&&<p role="alert" className={styles.error}>{error}<button type="button" onClick={load}>Retry</button></p>}
  <AdminArchiveList records={records} clock={clock} search={search} onSearch={setSearch} sort={sort} onSort={setSort} onView={open} onDelete={record=>{close();setDeleteError('');setPassword('');setDeletion(record);}} loading={loading} busy={deleting}/>
  {dialog&&<ClassDialog title="Details" wide showClose onClose={close}><div className={`${evidence.body} ${ui.details}`}>
   <span className={ui.type}>{dialog.record.kind==='school_year'?'School year':'Section'}</span><h3>{dialog.record.title}</h3><p>{archiveRetentionLabel(dialog.record,clock)}</p>
   {dialog.member&&<div className={styles.toolbar}><button onClick={()=>open(dialog.record)}>Back to archive details</button><button disabled={dialog.loading||dialog.downloading||!dialog.learners} onClick={download}>{dialog.downloading?'Please wait…':'Download section backup'}</button></div>}
   {dialog.downloadError&&<p role="alert">{dialog.downloadError}</p>}
   {dialog.loading?<p role="status">Loading archived records…</p>:dialog.error?<div role="alert"><p>{dialog.error}</p><button onClick={()=>open(dialog.record,dialog.member,dialog.page)}>Retry</button></div>:dialog.member?<>
    <h3>Section: {dialog.section.name}</h3><p>School Year {dialog.year.label}</p>
    {dialog.learners.map(learner=><ArchivedLearnerEvidence key={learner.id} learner={learner}/>)}{!dialog.learners.length&&<p>No learners were enrolled in this section.</p>}
    {dialog.total>25&&<div className={styles.toolbar}><button disabled={dialog.page===0} onClick={()=>open(dialog.record,dialog.member,dialog.page-1)}>Previous</button><span>{dialog.page*25+1}–{Math.min((dialog.page+1)*25,dialog.total)} of {dialog.total}</span><button disabled={(dialog.page+1)*25>=dialog.total} onClick={()=>open(dialog.record,dialog.member,dialog.page+1)}>Next</button></div>}
   </>:<>
    {dialog.record.kind==='school_year'?<p>This archive retains the learner information and assessment results for School Year {dialog.record.label}. Reusable sections remain available.</p>:<p>This is a reusable school section. Its retained assignments are listed by their original school year.</p>}
    {dialog.sections.map((section,index)=><article className="admin-detail" key={section.id||section.classSectionId||index}><h3>{dialog.record.kind==='school_year'?section.name:'School Year '+section.schoolYearLabel}</h3><p>{section.teacherName?'Teacher: '+section.teacherName:'No saved teacher assignment'}</p>{section.id?<><p>{section.learnerCount} learners</p><button onClick={()=>open(dialog.record,section)}>View Details</button></>:<p>No learner snapshot was recorded for this assignment.</p>}</article>)}
    {!dialog.sections.length&&<p>{dialog.record.kind==='school_year'?'No sections or learners were included in this school year.':'No saved assignments or learner records were included in this section.'}</p>}
   </>}
   <footer><button onClick={close}>Close</button></footer>
  </div></ClassDialog>}
  {deletion&&<ClassDialog title="Delete archive permanently" busy={deleting} onClose={()=>{if(!pendingDelete.current){setDeletion(null);setPassword('');}}}><form className={`${evidence.body} ${ui.deleteForm}`} onSubmit={deleteArchive}><p><strong>{deletion.title}</strong></p><p>Permanently delete this archive and its retained backup records? This cannot be undone.</p><label>Administrator password<input type="password" autoComplete="current-password" value={password} required maxLength={1024} disabled={deleting} onChange={event=>setPassword(event.target.value)}/></label>{deleteError&&<p role="alert">{deleteError}</p>}<footer><button type="button" disabled={deleting} onClick={()=>{setDeletion(null);setPassword('');}}>Cancel</button><button className={styles.danger} type="submit" disabled={deleting||!password}>{deleting?'Please wait…':'Confirm'}</button></footer></form></ClassDialog>}
 </section>;
}
