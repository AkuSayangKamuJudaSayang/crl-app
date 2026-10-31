"use client";
import {useState,useEffect,useRef} from 'react';
import ClassDialog from './ClassDialog';
import styles from './ClassWorkspace.module.css';
import {getOfflineOutbox,getOfflineTeacherSession} from '../lib/teacherOfflineDb';
import {reauthorizePendingDeletions} from '../lib/deletionPasswordClient.mjs';
export default function PendingDeletionPasswordDialog({onClose}){
  const [password,setPassword]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[items,setItems]=useState([]);
  const pending=useRef(false);
  useEffect(()=>{let cancelled=false;void(async()=>{const session=await getOfflineTeacherSession();const entries=await getOfflineOutbox();if(!cancelled)setItems(entries.filter(e=>Number(e.userId)===Number(session?.user?.id)&&['delete_learner','delete_learners'].includes(e.kind)));})().catch(()=>setError('Unable to read pending deletions.'));return()=>{cancelled=true;};},[]);
  const confirm=async()=>{if(pending.current||!password)return;pending.current=true;setBusy(true);setError('');try{await reauthorizePendingDeletions(password);setPassword('');onClose();}catch(error){setPassword('');setError(error.message);}finally{pending.current=false;setBusy(false);}};
  return <ClassDialog title="Confirm pending deletions" busy={busy} onClose={()=>{if(!pending.current)onClose();}}><p>These learner deletions are already saved locally and need account-password confirmation before cloud synchronization. Existing archives and pending assessment work are retained.</p><ul>{items.map(item=><li key={item.id}>{item.syncLabel?.details?.join(', ')||'Pending learner deletion'}</li>)}</ul><label><span>Account password</span><input type="password" autoComplete="current-password" disabled={busy} value={password} onChange={e=>setPassword(e.target.value)} /></label>{error?<p className={styles.error} role="alert">{error}</p>:null}<div className={styles.actions}><button type="button" className={styles.button} disabled={busy} onClick={onClose}>Cancel</button><button type="button" className={styles.primary} disabled={busy||!password||!items.length} onClick={confirm}>{busy?'Confirming…':'Confirm and sync'}</button></div></ClassDialog>;
}
