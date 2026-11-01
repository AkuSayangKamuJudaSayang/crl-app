"use client";
import ClassDialog from './ClassDialog';
import styles from './ClassWorkspace.module.css';
export default function AssessmentStartConfirmation({learnerName,activePeriod,periodOptions=[],busy=false,onCancel,onConfirm}){
 const option=periodOptions.find(x=>x.period===activePeriod),reason=!activePeriod?'The Reading Coordinator has not activated an assessment period for this school year.':option?.reason,canStart=Boolean(activePeriod&&option&&!reason&&!busy);
 return <ClassDialog title="Start assessment" onClose={onCancel} busy={busy}><p>Selected learner: <strong>{learnerName}</strong></p><p>Active assessment: <strong>{activePeriod||'Not activated'}</strong></p><p className={styles.hint}>The Reading Coordinator sets the active period for this school year. MoSY requires completed BoSY. EoSY requires completed MoSY.</p>{reason&&<p role="status">{reason}</p>}<div className={styles.actions}><button type="button" className={styles.button} disabled={busy} onClick={()=>{if(!busy)onCancel();}}>Cancel</button><button type="button" className={styles.primary} disabled={!canStart} onClick={()=>{if(canStart)onConfirm(activePeriod);}}>{busy?'Starting assessment…':'Start Assessment'}</button></div></ClassDialog>;
}
