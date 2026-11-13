"use client";
import ArchiveRetention,{useArchiveNow} from './ArchiveRetention';
import {archiveAvailable} from '../lib/archiveRetention.mjs';
import styles from './ClassWorkspace.module.css';
export default function ArchiveList({archives,catalog,busy,isOffline,onView,onDownload,onPurge}){
 const now=useArchiveNow(archives,catalog.serverNow,catalog.serverReceivedAt),groups=[];
 for(const item of archives.filter(row=>row.kind==='learner'&&archiveAvailable(row,now))){const key=item.deletionGroupId||item.id;const group=groups.find(row=>row.key===key);if(group)group.items.push(item);else groups.push({key,items:[item]});}
 return <><p>Deleted learners stay here for 30 days. View or download a backup before expiry. Import downloaded learner backups in Conduct Assessment.</p>{!groups.length?<p>No deleted learners.</p>:groups.map(({key,items})=>{const item=items[0],locked=busy||isOffline||items.some(row=>row.offline_pending);return <div className={styles.archive} key={key}><strong>{items.length>1?`${items.length} deleted learners`:item.learnerName}</strong><p>School Year {item.schoolYearLabel} · {item.sectionName}</p><ArchiveRetention item={item} now={now}/><div className={styles.actions}><button disabled={locked} onClick={()=>onView(items)}>View</button><button disabled={locked} onClick={()=>onDownload(items)}>Download backup</button><button className={styles.danger} disabled={locked} onClick={()=>onPurge(items)}>Delete permanently</button></div></div>;})}</>;
}
