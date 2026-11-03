"use client";
import ArchiveRetention,{useArchiveNow} from './ArchiveRetention';
import styles from './ClassWorkspace.module.css';

export default function ArchiveRecordPreview({item,serverNow,serverReceivedAt}) {
  const now=useArchiveNow([item],serverNow,serverReceivedAt);
  const learner=item.kind==='learner',year=item.kind==='school_year';
  return <article className={styles.selectedArchive} data-archive-preview aria-label={learner?'Selected learner':year?'Selected school year':'Selected section'}>
    <span className={styles.selectedArchiveLabel}>{learner?'Selected learner':year?'Selected school year':'Selected section'}</span>
    <strong>{learner?item.learnerName:year?`School Year ${item.schoolYearLabel}`:item.sectionName}</strong>
    {!year&&<small>School Year {item.schoolYearLabel} · Section: {item.sectionName}</small>}
    {item.restoredAt&&<small>Already restored</small>}
    {item.offline_pending&&<small>Pending synchronization</small>}
    <ArchiveRetention item={item} now={now}/>
  </article>;
}
