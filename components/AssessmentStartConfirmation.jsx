"use client";
import {useState} from "react";
import ClassDialog from "./ClassDialog";
import styles from "./ClassWorkspace.module.css";
export default function AssessmentStartConfirmation({period,learnerName,periodOptions=[],onCancel,onConfirm}){
 const [selected,setSelected]=useState(period||periodOptions.find(x=>!x.reason)?.period||'BoSY');
 const disabled=periodOptions.find(x=>x.period===selected)?.reason;
 return <ClassDialog title="Start assessment" onClose={onCancel}><p>Selected learner: <strong>{learnerName}</strong></p><p>Choose the assessment period.</p><div className={styles.periods} role="radiogroup" aria-label="Assessment period">{['BoSY','MoSY','EoSY'].map(value=>{const reason=periodOptions.find(x=>x.period===value)?.reason;return <button type="button" key={value} role="radio" aria-checked={selected===value} disabled={Boolean(reason)} title={reason||value} onClick={()=>setSelected(value)}>{value}</button>;})}</div><p className={styles.hint}>MoSY requires completed BoSY. EoSY requires completed MoSY. Completed periods cannot be assessed again.</p><div className={styles.actions}><button type="button" className={styles.button} onClick={onCancel}>Cancel</button><button type="button" className={styles.primary} disabled={Boolean(disabled)} onClick={()=>onConfirm(selected)}>Start Assessment</button></div></ClassDialog>;
}
