'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import ClassDialog from './ClassDialog';
import Select from './Select';
import WorkspaceLoading from './WorkspaceLoading';
import styles from './AdminSupport.module.css';
const accountRole=row=>row.teacher.role==='reading_coordinator'?'Reading Coordinator':'Teacher';
const date=value=>value?new Date(value).toLocaleString('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'}):'—';
export default function AdminSupport({view}){
 const [type,setType]=useState('bug'),[rows,setRows]=useState([]),[cursor,setCursor]=useState(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[confirm,setConfirm]=useState(null);
 const generation=useRef(0),pending=useRef(false),mutation=useRef(false),life=useRef(0);
 const action=view==='unlock'?'unlock_requests':'reports';
 const api=useCallback(async(action,body,query='')=>{
  const response=await fetch(`/api/access?role=admin${body?'':`&action=${action}${query}`}`,{credentials:'include',cache:'no-store',...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...body})}:{})});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Unable to load these items.');return data;
 },[]);
 const load=useCallback(async(next=null)=>{const request=++generation.current;pending.current=true;setLoading(true);setError('');
  try{const data=await api(action,null,`&type=${type}${next?'&cursor='+encodeURIComponent(next):''}`);if(request===generation.current){setRows(current=>next?[...current,...data.entries.filter(row=>!current.some(old=>old.id===row.id))]:data.entries);setCursor(data.next_cursor);}}
  catch(e){if(request===generation.current)setError(e.message);}finally{if(request===generation.current){pending.current=false;setLoading(false);}}
 },[api,action,type]);
 useEffect(()=>{setRows([]);setCursor(null);setConfirm(null);setNotice('');void load();return()=>{generation.current++;};},[load]);
 useEffect(()=>()=>{life.current++;},[]);
 useEffect(()=>{if(view!=='unlock')return;const timer=setInterval(()=>{if(!document.hidden&&!pending.current&&!mutation.current)void load();},20000);return()=>clearInterval(timer);},[view,load]);
 const act=async(action,row)=>{if(mutation.current)return;const current=life.current;mutation.current=true;setBusy(true);setError('');setNotice('');
  try{await api(action,{id:row.id,...(view==='reports'?{type,is_resolved:!row.isResolved}:{})});if(current!==life.current)return;setConfirm(null);setNotice(action==='approve_unlock'?'Account unlocked. They can sign in again.':action==='dismiss_unlock'?'Unlock request dismissed.':'Report updated.');await load();}
  catch(e){if(current===life.current)setError(e.message);}finally{if(current===life.current){mutation.current=false;setBusy(false);}}
 };
 return <section className={styles.root} aria-label={view==='unlock'?'Unlock requests':'Reports'}>
  <header className={styles.heading}><div><h2>{view==='unlock'?'Unlock requests':'Reports'}</h2><p>{view==='unlock'?'Verify the account holder’s identity through a trusted school contact before unlocking. Password and authenticator checks remain required.':'Review bug reports and feedback submitted by your school.'}</p></div><button type="button" disabled={loading||busy} onClick={()=>load()}>Refresh</button></header>
  {view==='reports'&&<label className={styles.filter}>Report type<Select value={type} disabled={busy} onChange={e=>setType(e.target.value)}><option value="bug">Bug reports</option><option value="feedback">Feedback</option></Select></label>}
  {notice&&<p className={styles.success} role="status">{notice}</p>}{error&&<p className={styles.error} role="alert">{error}</p>}
  <div className={styles.list}>{rows.map(row=><article className={styles.item} key={row.id}>
   <div className={styles.content}><strong>{view==='unlock'?row.teacher.fullName:row.name||'Anonymous'}</strong><small>{view==='unlock'?`${row.teacher.username} · ${accountRole(row)+(row.teacher.section?' · '+row.teacher.section:'')}`:date(row.createdAt)}</small>
    {view==='unlock'?<><small>Requested {date(row.created_at)} · Locked until {date(row.locked_until)}</small><span className={styles.status}>{row.status}</span></>:<><p>{row.message}</p>{row.contact&&<small>{row.contact}</small>}<span className={styles.status}>{row.isResolved?'Resolved':'Open'}</span></>}
   </div><div className={styles.actions}>
    {view==='unlock'?<><button type="button" className={styles.primary} disabled={busy||row.status!=='pending'} onClick={()=>setConfirm({row,action:'approve_unlock',title:'Unlock account?',text:'Confirm that you have verified this person’s identity. Their password and authenticator remain required.'})}>Unlock</button><button type="button" disabled={busy||row.status!=='pending'} onClick={()=>setConfirm({row,action:'dismiss_unlock',title:'Dismiss unlock request?',text:'The account will stay locked until its timer expires.'})}>Dismiss</button></>:<><button type="button" disabled={busy} onClick={()=>act('update_report',row)}>{row.isResolved?'Reopen':'Resolve'}</button><button type="button" className={styles.danger} disabled={busy} onClick={()=>setConfirm({row,action:'delete_report',title:'Delete report?',text:'Delete this report from the active report list?'})}>Delete</button></>}
   </div>
  </article>)}</div>
  {loading&&<WorkspaceLoading label={view==='unlock'?'Loading unlock requests…':'Loading reports…'} variant={view==='unlock'?'unlock':'reports'} rows={rows.length?2:4}/>}
  {!loading&&!rows.length&&!error&&<p className={styles.empty}>No {view==='unlock'?'unlock requests':type==='bug'?'bug reports':'feedback'} yet.</p>}
  {cursor&&<button type="button" disabled={busy||loading} onClick={()=>load(cursor)}>Load more</button>}
  {confirm&&<ClassDialog title={confirm.title} busy={busy} onClose={()=>{if(!busy){setConfirm(null);setError('');}}}><div className={styles.dialog}><p>{confirm.text}</p>{error&&<p role="alert" className={styles.error}>{error}</p>}<div className={styles.actions}><button type="button" disabled={busy} onClick={()=>{setConfirm(null);setError('');}}>Cancel</button><button type="button" className={styles.primary} disabled={busy} onClick={()=>act(confirm.action,confirm.row)}>{busy?'Please wait…':'Confirm'}</button></div></div></ClassDialog>}
 </section>;
}
