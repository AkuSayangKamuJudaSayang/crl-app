"use client";
import {useState} from 'react';
import ClassDialog from './ClassDialog';
import styles from './ClassWorkspace.module.css';
export default function AssessmentStartConfirmation({learnerName,periodOptions=[],busy=false,onCancel,onConfirm}){
 const [period,setPeriod]=useState('');const option=periodOptions.find(x=>x.period===period),canStart=Boolean(option&&!option.reason&&!busy);
 return <ClassDialog title="Start assessment" onClose={onCancel} busy={busy}><p>Selected learner: <strong>{learnerName}</strong></p><p className={styles.hint}>Choose a timeline. MoSY requires completed BoSY. EoSY requires completed MoSY.</p><div className={styles.periods} role="radiogroup" aria-label="Assessment timeline">{periodOptions.map(o=><button type="button" key={o.period} role="radio" aria-checked={period===o.period} disabled={busy||Boolean(o.reason)} title={o.reason||o.period} onClick={()=>setPeriod(o.period)}>{o.period}</button>)}</div>{periodOptions.filter(o=>o.reason).map(o=><p key={o.period} className={styles.hint}>{o.period}: {o.reason}</p>)}<div className={styles.actions}><button type="button" className={styles.button} disabled={busy} onClick={()=>{if(!busy)onCancel();}}>Cancel</button><button type="button" className={styles.primary} disabled={!canStart} onClick={()=>{if(canStart)onConfirm(period);}}>{busy?'Starting assessment…':'Start Assessment'}</button></div></ClassDialog>;
}
