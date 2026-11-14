'use client';
import {useEffect,useRef,useState} from 'react';
import AuditDetailsDialog,{auditDate} from './AuditDetailsDialog';
import {auditEventLabel} from '../lib/auditEventLabels.mjs';
import styles from './Portal.module.css';
import ui from './SystemAdmin.module.css';

const categories=[{value:'general',label:'General'},{value:'reading_coordinator',label:'Reading Coordinators'},{value:'teacher',label:'Teachers'}];

export default function SystemAdminLogs({refreshToken}){
 const [category,setCategory]=useState('general');
 const [data,setData]=useState({staff:[],entries:[],next_cursor:null});
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState('');
 const [detail,setDetail]=useState(null);
 const generation=useRef(0),detailGeneration=useRef(0),more=useRef(false);
 const closeDetails=()=>{detailGeneration.current++;setDetail(null);};
 useEffect(()=>()=>{detailGeneration.current++;},[]);
 const query=()=>`/api/access?role=admin&action=logs&category=${encodeURIComponent(category)}`;

 useEffect(()=>{
  const id=++generation.current;
  setData(current=>({...current,entries:[],next_cursor:null}));
  closeDetails();
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
  const id=generation.current,request=++detailGeneration.current;
  setDetail({entry,loading:true});
  try{
   const response=await fetch(query()+`&id=${encodeURIComponent(entry.id)}`,{cache:'no-store'});
   const result=await response.json();
   if(!response.ok)throw Error(result.error);
   if(id===generation.current&&request===detailGeneration.current)setDetail(result);
  }catch(reason){
   if(id===generation.current&&request===detailGeneration.current)setDetail({entry,error:reason.message});
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
      <strong>{auditEventLabel(entry.event)}</strong>
      <small>{entry.actorName} · {entry.count} item{entry.count===1?'':'s'}</small>
      <time dateTime={entry.occurredAt}>{auditDate(entry.occurredAt)}</time>
     </div>
     <button type="button" className={styles.secondary} onClick={()=>view(entry)}>View Details</button>
    </article>)}
   </div>
   {loading&&<div className={ui.logLoading} aria-label="Loading log entries">{[1,2,3].map(n=><div className={styles.skeleton} key={n}/>)}</div>}
   {!loading&&!data.entries.length&&!error&&<p className={styles.empty}>No recorded activity in the past seven days.</p>}
   {data.next_cursor&&<div className={styles.dialogActions}><button type="button" className={styles.secondary} disabled={loading} onClick={loadMore}>Load more</button></div>}
  </section>
  {detail&&<AuditDetailsDialog state={detail} onClose={closeDetails} onRetry={()=>view(detail.entry)}/>}
 </>;
}
