"use client";

import { useRef, useState } from "react";
import ClassDialog from "./ClassDialog";
import { unlockDeletionKey, signLearnerDeletion } from "../lib/deletionPasswordClient.mjs";
import styles from "./ClassWorkspace.module.css";

export default function DeleteLearnersDialog({learners,user,rosterVersion=0,action="delete_learner",onCancel,onConfirm,busy}) {
  const [password,setPassword]=useState(''),[reason,setReason]=useState(''),[verifying,setVerifying]=useState(false),[error,setError]=useState('');
  const pending=useRef(false),locked=busy||verifying;
  const cancel=()=>{if(!pending.current&&!busy){setPassword('');onCancel();}};
  const submit=async()=>{
    if(pending.current||busy||!password||reason.trim().length<5)return;
    pending.current=true;setVerifying(true);setError('');
    try{
      const unlocked=await unlockDeletionKey(password,user);
      const body=await signLearnerDeletion(action,{deletion_reason:reason.trim(),roster_version:rosterVersion},learners.map(row=>({id:Number(row.id??row.learner?.id),lrn:row.lrn??row.LRN??row.learner?.lrn})),unlocked);
      setPassword('');
      if(await onConfirm(body)===false)setError('Deletion was not completed. Review the message and try again.');
    }catch(failure){setPassword('');setError(failure.message||'Unable to confirm deletion.');}
    finally{pending.current=false;setVerifying(false);}
  };
  return <ClassDialog title={learners.length===1?'Delete learner':'Delete selected learners'} onClose={cancel} busy={locked}>
    <p>{learners.length===1?<><strong>{learners[0].first_name} {learners[0].last_name}</strong> and this enrollment's assessment records will be removed.</>:<>{learners.length} selected learners and their assessment records will be removed.</>} Each learner will be saved separately in Archives in Assessment Records before removal. Offline deletions appear as pending until synchronization completes. Other school years and sections keep their records.</p>
    <label><span>Why are you deleting {learners.length===1?'this learner':'these learners'}?</span><textarea rows={2} maxLength={300} disabled={locked} value={reason} onChange={event=>setReason(event.target.value)} placeholder="For example, duplicate or incorrect enrollment" /></label>
    <label><span>Account password</span><input type="password" value={password} disabled={locked} onChange={event=>{setPassword(event.target.value);setError('');}} autoComplete="current-password" spellCheck={false} /></label>
    {error?<p className={styles.error} role="alert">{error}</p>:null}
    <div className={styles.actions}><button type="button" className={styles.button} disabled={locked} onClick={cancel}>Cancel</button><button type="button" className={styles.danger} disabled={locked||!password||reason.trim().length<5} onClick={submit}>{verifying?'Confirming deletion…':busy?'Deleting…':'Delete'}</button></div>
  </ClassDialog>;
}
