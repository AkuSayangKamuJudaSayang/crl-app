"use client";
import {useState} from "react";
import ClassDialog from "./ClassDialog";
import styles from "./ClassWorkspace.module.css";
export default function AssessmentStartConfirmation({learnerName,periodOptions=[],busy=false,onCancel,onConfirm}){
 // Pairing prepares the transport; it never chooses a learner's timeline.
 // A fresh choice is required even when only one period is currently eligible.
 const [selected,setSelected]=useState('');
 const choice=periodOptions.find(x=>x.period===selected);
 const canStart=Boolean(choice && !choice.reason && !busy);
 return <ClassDialog title="Start assessment" onClose={onCancel} busy={busy}><p>Selected learner: <strong>{learnerName}</strong></p><p>Choose the assessment period.</p><div className={styles.periods} role="radiogroup" aria-label="Assessment period">{['BoSY','MoSY','EoSY'].map(value=>{const option=periodOptions.find(x=>x.period===value);const reason=option?.reason;return <button type="button" key={value} role="radio" aria-checked={selected===value} disabled={busy || !option || Boolean(reason)} title={reason||value} onClick={()=>{if(!busy && option && !reason)setSelected(value);}}>{value}</button>;})}</div><p className={styles.hint}>MoSY requires completed BoSY. EoSY requires completed MoSY. Completed periods cannot be assessed again.</p><div className={styles.actions}><button type="button" className={styles.button} disabled={busy} onClick={()=>{if(!busy)onCancel();}}>Cancel</button><button type="button" className={styles.primary} disabled={!canStart} onClick={()=>{if(canStart)onConfirm(selected);}}>{busy ? 'Starting assessment…' : 'Start Assessment'}</button></div></ClassDialog>;
}
