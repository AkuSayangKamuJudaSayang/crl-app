"use client";

import { useState } from "react";
import ClassDialog from "./ClassDialog";
import { deletionPhrase } from "../lib/classWorkspace.mjs";
import styles from "./ClassWorkspace.module.css";
export default function DeleteLearnersDialog({
  learners,
  onCancel,
  onConfirm,
  busy
}) {
  const [confirmation, setConfirmation] = useState(''),
    [reason, setReason] = useState('');
  const phrase = deletionPhrase(learners);
  return <ClassDialog title={learners.length === 1 ? 'Delete learner' : 'Delete selected learners'} onClose={onCancel} busy={busy}><p>{learners.length === 1 ? <><strong>{learners[0].first_name} {learners[0].last_name}</strong> and this enrollment's assessment records will be removed.</> : <>{learners.length} selected learners and their assessment records will be removed.</>} Other school years and sections will keep their own records.</p><label><span>Why are you deleting {learners.length === 1 ? 'this learner' : 'these learners'}?</span><textarea rows={2} maxLength={300} value={reason} onChange={e => setReason(e.target.value)} placeholder="For example, duplicate or incorrect enrollment" /></label><label><span>Type <strong>{phrase}</strong> to confirm</span><input value={confirmation} onChange={e => setConfirmation(e.target.value)} autoComplete="off" spellCheck={false} /></label><div className={styles.actions}><button className={styles.button} disabled={busy} onClick={onCancel}>Cancel</button><button className={styles.danger} disabled={busy || confirmation !== phrase || reason.trim().length < 5} onClick={() => onConfirm({
        confirmation,
        deletion_reason: reason.trim()
      })}>{busy ? 'Deleting...' : 'Delete'}</button></div></ClassDialog>;
}
