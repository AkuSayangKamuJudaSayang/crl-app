"use client";
import ClassDialog from './ClassDialog';
import AuditEventDetails from './AuditEventDetails';
import styles from './AuditDetails.module.css';
export const auditDate=value=>value?new Date(value).toLocaleString('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'}):'—';
export function AuditDetailsBody({state,onClose,onRetry,children}){
 const entry=state.entry;
 return <div className={styles.body} aria-busy={Boolean(state.loading)}>
  <header className={styles.meta}><strong>{entry.actorName||entry.actor_name||'System Administrator'}</strong><time dateTime={entry.occurredAt||entry.occurred_at}>{auditDate(entry.occurredAt||entry.occurred_at)}</time></header>
  {state.loading?<p role="status">Loading activity details…</p>:state.error?<div role="alert"><p>{state.error}</p><button type="button" onClick={onRetry}>Retry</button></div>:<><AuditEventDetails entry={entry} detail={state.detail||{}}/>{children}</>}
  <footer><button type="button" onClick={onClose}>Close</button></footer>
 </div>;
}

export default function AuditDetailsDialog(props){
 return <ClassDialog title="Details" showClose onClose={props.onClose}><AuditDetailsBody {...props}/></ClassDialog>;
}
