'use client';
import {Fragment,useEffect,useRef,useState} from 'react';
import ClassDialog from './ClassDialog';
import styles from './Portal.module.css';
import ui from './SystemAdmin.module.css';

const label=event=>({login:'Signed in','account.registered':'Invitation redeemed','school.created':'School registered','coordinator.invite.created':'Coordinator invited','admin.invite.created':'Administrator invited','coordinator.access.changed':'Coordinator access changed'})[event]||event.replaceAll('_',' ').replaceAll('.',' · ');
const fields={inviteId:'Invitation reference',code:'Redeemed code',usedByName:'Used by',role:'Account role',schoolId:'School number',schoolName:'School',targetName:'Account',period:'Timeline',version:'Version',startYear:'School year starts',teacherCount:'Teachers affected',reason:'Reason',deletionReason:'Reason',kind:'Record type',empty:'Empty class',classSectionId:'Section reference',schoolYearId:'School year reference',backupName:'Backup name'};
const categories=[{value:'general',label:'General'},{value:'reading_coordinator',label:'Reading Coordinators'},{value:'teacher',label:'Teachers'}];

export default function SystemAdminLogs({refreshToken}){
 const [category,setCategory]=useState('general');
 const [data,setData]=useState({staff:[],entries:[],next_cursor:null});
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState('');
 const [detail,setDetail]=useState(null);
 const generation=useRef(0),more=useRef(false);
 const query=()=>`/api/access?role=admin&action=logs&category=${encodeURIComponent(category)}`;

 useEffect(()=>{
  const id=++generation.current;
  setData(current=>({...current,entries:[],next_cursor:null}));
  setDetail(null);
  setError('');
  setLoading(true);
  const controller=new AbortController();
  fetch(query(),{cache:'no-store',signal:controller.signal}).then(async response=>{
   const result=await response.json();
   if(!response.ok)throw Error(result.error);
   if(id===generation.current)setData(result);
  }).catch(reason=>{
   if(reason.name!=='AbortError'&&id===generation.current)setError(reason.message);
  }).finally(()=>{if(id===generation.current)setLoading(false);});
  return()=>controller.abort();
 },[category,refreshToken]);

 const loadMore=async()=>{
  if(more.current||!data.next_cursor)return;
  more.current=true;
  const id=generation.current;
  setLoading(true);
  setError('');
  try{
   const response=await fetch(query()+`&cursor=${encodeURIComponent(data.next_cursor)}`,{cache:'no-store'});
   const result=await response.json();
   if(!response.ok)throw Error(result.error);
   if(id===generation.current)setData(current=>({...result,entries:[...current.entries,...result.entries.filter(entry=>!current.entries.some(old=>old.id===entry.id))]}));
  }catch(reason){
   if(id===generation.current)setError(reason.message);
  }finally{
   more.current=false;
   if(id===generation.current)setLoading(false);
  }
 };

 const view=async entry=>{
  const id=generation.current;
  setDetail({entry,loading:true});
  try{
   const response=await fetch(query()+`&id=${encodeURIComponent(entry.id)}`,{cache:'no-store'});
   const result=await response.json();
   if(!response.ok)throw Error(result.error);
   if(id===generation.current)setDetail(result);
  }catch(reason){
   if(id===generation.current)setDetail({entry,error:reason.message});
  }
 };

 return <>
  <section className={`${styles.panel} ${ui.panel} ${ui.logFeed}`} aria-busy={loading}>
   <div className={ui.logFeedHeader}>
    <h2 className={ui.logHeading}>Activity log</h2>
    <p className={ui.hint}>Recorded school activities from the past seven days. Sign-ins are hidden.</p>
   </div>
   <div className={ui.logCategoryTabs} role="group" aria-label="Activity categories">
    {categories.map(item=><button
     type="button"
     key={item.value}
     className={ui.logCategoryButton}
     aria-pressed={category===item.value}
     onClick={()=>setCategory(item.value)}
    >{item.label}</button>)}
   </div>
   {error&&<p className={styles.error} role="alert">{error}</p>}
   <div className={ui.logList} aria-label="Audit entries">
    {data.entries.map(entry=><article className={ui.person} key={entry.id}>
     <div>
      <strong>{label(entry.event)}</strong>
      <small>{entry.actorName} · {entry.count} item{entry.count===1?'':'s'}</small>
      <time dateTime={entry.occurredAt}>{new Date(entry.occurredAt).toLocaleString('en-PH')}</time>
     </div>
     <button type="button" className={styles.secondary} onClick={()=>view(entry)}>View</button>
    </article>)}
   </div>
   {loading&&<div className={ui.logLoading} aria-label="Loading log entries">{[1,2,3].map(n=><div className={styles.skeleton} key={n}/>)}</div>}
   {!loading&&!data.entries.length&&!error&&<p className={styles.empty}>No recorded activity in the past seven days.</p>}
   {data.next_cursor&&<div className={styles.dialogActions}><button type="button" className={styles.secondary} disabled={loading} onClick={loadMore}>Load more</button></div>}
  </section>
  {detail&&<ClassDialog title={label(detail.entry.event)} showClose onClose={()=>setDetail(null)}>
   <div className={`${styles.workspace} ${ui.dialog}`}>
    <p>{detail.entry.actorName}</p>
    <p className={ui.hint}>{new Date(detail.entry.occurredAt).toLocaleString('en-PH')} · {detail.entry.count} item{detail.entry.count===1?'':'s'}</p>
    {detail.loading?<div className={styles.skeleton} aria-label="Loading entry"/>:detail.error?<p className={styles.error} role="alert">{detail.error}</p>:<>
     <dl className={ui.facts}>{Object.entries(fields).filter(([key])=>detail.detail?.[key]!==undefined).map(([key,name])=><Fragment key={key}><dt>{name}</dt><dd>{String(detail.detail[key])}</dd></Fragment>)}</dl>
     {!Object.keys(detail.detail||{}).some(key=>fields[key])&&<p className={ui.hint}>The event metadata above is the available record for this activity.</p>}
    </>}
    <div className={styles.dialogActions}><button type="button" className={styles.secondary} onClick={()=>setDetail(null)}>Close</button></div>
   </div>
  </ClassDialog>}
 </>;
}
