import {Fragment} from 'react';
// Explicitly render supported history metadata; never dump encrypted/private payloads.
const FIELDS={backupId:"Backup record",backupName:"Backup name",period:'Timeline',version:'Saved version',startYear:'School year starts',teacherCount:'Teachers affected',action:'Action',reason:'Reason',deletionReason:'Reason',kind:'Record type',empty:'Empty class',revisionId:'Content revision',archiveId:'Archive record',classSectionId:'Section record',schoolYearId:'School year record'};
export default function AuditEventDetails({entry,detail={}}){
 const fields=Object.entries(FIELDS).filter(([key])=>detail[key]!==undefined&&detail[key]!==null);
 return <section aria-label="Audit event details"><h3>{entry.event.replaceAll('_',' ').replaceAll('.',' · ')}</h3><p>{entry.count} {entry.count===1?'item':'items'} recorded</p>{fields.length>0&&<dl className="admin-facts">{fields.map(([key,label])=><Fragment key={key}><dt>{label}</dt><dd>{typeof detail[key]==='boolean'?(detail[key]?'Yes':'No'):String(detail[key])}</dd></Fragment>)}</dl>}
 {detail.items?.map((item,i)=><article className="admin-detail" key={i}><h4>{item.category.replaceAll('_',' ')} · {item.title||`Item ${item.position}`}</h4><p className="admin-content">{item.content}</p></article>)}
 {detail.learnerIds?.length>0&&<p>{detail.learnerIds.length} learners were deleted. Their recoverable records are listed in Recovery under the original teacher.</p>}
 {detail.archiveIds?.length>0&&<p>{detail.archiveIds.length} archive records were affected.</p>}
 {detail.unavailable&&<p>The saved content revision is unavailable. The event metadata above remains recorded.</p>}
 {!fields.length&&!detail.items?.length&&!detail.learners?.length&&!detail.changes?.length&&!detail.scope&&!detail.report&&!detail.inviteId&&!detail.learnerIds?.length&&!detail.archiveIds?.length&&<p>No additional item details were stored for this event.</p>}
 </section>;
}
