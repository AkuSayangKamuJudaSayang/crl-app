import {auditEventLabel} from '../lib/auditEventLabels.mjs';
import {Fragment} from 'react';
// Explicitly render supported history metadata; never dump encrypted/private payloads.
const FIELDS={code:'Redeemed code',usedByName:'Used by',schoolId:'School number',inviteId:'Invitation reference',role:'Account role',schoolName:'School',targetName:'Account',version:'Content version',schoolSectionId:'Reusable section reference',classSectionId:'Section reference',schoolYearId:'School year reference',backupName:'Backup name',period:'Assessment timeline',startYear:'School year starts',teacherCount:'Teachers affected',action:'Action',reason:'Reason',deletionReason:'Reason',kind:'Record type',empty:'Empty class',isLive:'Live now',scheduleEnabled:'Schedule enabled',startsAt:'Start date and time',endsAt:'End date and time'};
const fieldValue=(key,value)=>typeof value==='boolean'?(value?'Yes':'No'):key.endsWith('At')?new Date(value).toLocaleString('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'}):key==='action'?({activate:'Timeline status changed',toggle:'Timeline status updated',schedule:'Schedule edited'}[value]||auditEventLabel(value)):String(value);

export default function AuditEventDetails({entry,detail={}}){
 const fields=Object.entries(FIELDS).filter(([key])=>detail[key]!==undefined&&detail[key]!==null);
 return <section className="auditEntryDetails" aria-label="Activity details"><h3>{auditEventLabel(entry.event)}</h3><p>{entry.count} {entry.count===1?'item':'items'} recorded</p>{fields.length>0&&<dl className="admin-facts">{fields.map(([key,label])=><Fragment key={key}><dt>{label}</dt><dd>{fieldValue(key,detail[key])}</dd></Fragment>)}</dl>}
 {Array.isArray(detail.items)&&detail.items.map((item,i)=><article className="admin-detail" key={i}><h4>{String(item.category||'Item').replaceAll('_',' ')} · {item.title||`Item ${item.position}`}</h4><p className="admin-content">{item.content}</p></article>)}
 {detail.learnerIds?.length>0&&<p>{detail.learnerIds.length} learners were deleted. Their recoverable records are listed in Archive under the original teacher.</p>}
 {detail.archiveIds?.length>0&&<p>{detail.archiveIds.length} archive records were affected.</p>}
 {detail.unavailable&&<p>Additional saved details are unavailable for this activity. The original event metadata remains recorded.</p>}
 {!detail.unavailable&&!fields.length&&!detail.items?.length&&!detail.learners?.length&&!detail.changes?.length&&!detail.scope&&!detail.report&&!detail.inviteId&&!detail.learnerIds?.length&&!detail.archiveIds?.length&&<p>No additional item details were stored for this event.</p>}
 </section>;
}
