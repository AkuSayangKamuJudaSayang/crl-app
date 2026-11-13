"use client";
import ArchiveRetention,{useArchiveNow} from './ArchiveRetention';
import {archiveAvailable} from '../lib/archiveRetention.mjs';
import styles from './Coordinator.module.css';
export default function RecoveryArchiveList({rows,clock,busy,onView,onDownload,onPurge}){
 const now=useArchiveNow(rows,clock.serverNow,clock.serverReceivedAt),groups=[];
 for(const item of rows.filter(r=>r.kind==='learner'&&archiveAvailable(r,now))){const key=item.deletionGroupId?`${item.teacherId}:${item.deletionGroupId}`:item.id;let group=groups.find(g=>g.key===key);if(!group){group={key,items:[]};groups.push(group);}group.items.push(item);}
 if(!groups.length)return <div className={styles.recoveryEmpty}><strong>No deleted learners</strong><p>Deleted learners will appear here for 30 days.</p></div>;
 return <div className={styles.recoveryList}>{groups.map(({key,items})=>{const item=items[0],count=item.groupSize||items.length;return <article className={styles.recoveryRow} key={key}><div className={styles.recoveryInfo}><h3>{count>1?`${count} deleted learners`:item.learnerName}</h3><p>Teacher: <strong>{item.teacherName}</strong></p><p>School Year {item.schoolYearLabel} · Section: {item.sectionName}</p><ArchiveRetention item={item} now={now}/></div><div className={styles.recoveryRowActions}><button className={styles.primary} disabled={busy} onClick={()=>onView(items)}>View</button><button className={styles.secondary} disabled={busy} onClick={()=>onDownload(items)}>Download</button><button className={styles.danger} disabled={busy} onClick={()=>onPurge(items)}>Delete permanently</button></div></article>;})}</div>;
}
