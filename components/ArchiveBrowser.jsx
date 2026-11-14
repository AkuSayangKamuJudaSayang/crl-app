'use client';
import {useEffect,useMemo,useState} from 'react';
import Select from './Select';
import ArchiveRetention,{useArchiveNow} from './ArchiveRetention';
import {archiveAvailable} from '../lib/archiveRetention.mjs';
import {filterArchiveGroups} from '../lib/archiveBrowser.mjs';
import styles from './Coordinator.module.css';
export default function ArchiveBrowser({rows,clock={},busy,onView,onDownload,onPurge,grouped=true}){
 const [search,setSearch]=useState(''),[sort,setSort]=useState('newest'),[selected,setSelected]=useState([]);
 const now=useArchiveNow(rows,clock.serverNow,clock.serverReceivedAt);
 const available=useMemo(()=>rows.filter(row=>archiveAvailable(row,now)),[rows,now]);
 const groups=useMemo(()=>filterArchiveGroups(available,{search,sort,grouped}),[available,search,sort,grouped]);
 const ids=new Set(available.map(row=>row.id)),selection=selected.filter(id=>ids.has(id)),selectionSet=new Set(selection),selectedRows=available.filter(row=>selectionSet.has(row.id));
 useEffect(()=>{const rowIds=new Set(rows.map(row=>row.id));setSelected(current=>{const next=current.filter(id=>rowIds.has(id));return next.length===current.length?current:next;});},[rows]);
 const toggle=items=>setSelected(current=>{const currentIds=new Set(current),itemIds=new Set(items.map(row=>row.id));return items.every(row=>currentIds.has(row.id))?current.filter(id=>!itemIds.has(id)):[...new Set([...current,...itemIds])];});
 return <div className={styles.archiveBrowser} aria-busy={busy}>
  <div className={styles.archiveSearchRow}><label><span>Search</span><input type="search" value={search} disabled={busy} placeholder={grouped?'Learner, teacher, section or school year':'Learner name or LRN'} onChange={event=>setSearch(event.target.value)}/></label><label><span>Order</span><Select value={sort} disabled={busy} onChange={event=>setSort(event.target.value)}><option value="newest">Latest to oldest</option><option value="oldest">Oldest to latest</option></Select></label></div>
  <div className={styles.archiveActionBar}><span>{selection.length} selected · {available.length} archived learners</span><div>
   <button type="button" disabled={busy||!groups.length} onClick={()=>setSelected([...new Set([...selected,...groups.flatMap(group=>group.items.map(row=>row.id))])])}>Select all</button>
   <button type="button" disabled={busy||!selection.length} onClick={()=>setSelected([])}>Deselect all</button>
   <button type="button" disabled={busy||!selection.length} onClick={()=>onDownload(selectedRows)}>Download selected</button>
   <button type="button" disabled={busy||!available.length} onClick={()=>onDownload(available)}>Download all</button>
   {onPurge&&<button type="button" className={styles.danger} disabled={busy||!selection.length} onClick={()=>onPurge(selectedRows)}>Delete selected</button>}
   {onPurge&&<button type="button" className={styles.danger} disabled={busy||!available.length} onClick={()=>onPurge(available)}>Delete all</button>}
  </div></div>
  {!groups.length?<div className={styles.recoveryEmpty}><strong>{available.length?'No matching archives':'No archived learners'}</strong><p>{available.length?'Try another search.':'Deleted learners will appear here for 30 days.'}</p></div>:<div className={styles.recoveryList}>{groups.map(({key,items})=>{const item=items[0],count=items.length;return <article className={styles.recoveryRow} key={key}><label className={styles.archiveCheck}><input type="checkbox" disabled={busy} checked={items.every(row=>selectionSet.has(row.id))} onChange={()=>toggle(items)} aria-label={`Select ${count>1?count+' learners':item.learnerName}`}/></label><div className={styles.recoveryInfo}><h3>{count>1?`${count} deleted learners`:item.learnerName||'Learner'}</h3><p>Teacher: <strong>{item.teacherName||'Not recorded'}</strong></p><p>School Year {item.schoolYearLabel} · Section: {item.sectionName}</p><p>Archived: {item.createdAt?new Date(item.createdAt).toLocaleString('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'}):'Not recorded'}</p>{item.details&&<><p>LRN: {item.details.lrn||'Not recorded'} · Sex: {item.details.sex||'Not recorded'}</p>{item.details.assessmentSessions?.length?<details><summary>Assessment results ({item.details.assessmentSessions.length})</summary>{item.details.assessmentSessions.map(record=><p key={record.id}>{record.assessmentPeriod}: {record.overallClassification||'Unclassified'} · {record.isCompleted?'Completed':'Incomplete'}</p>)}</details>:<p>No assessment results recorded.</p>}</>}</div><div className={styles.archiveRetention}><ArchiveRetention item={item} now={now}/></div><div className={styles.recoveryRowActions}>{onView&&<button type="button" className={styles.primary} disabled={busy} onClick={()=>onView(items)}>View</button>}<button type="button" disabled={busy} onClick={()=>onDownload(items)}>Download</button>{onPurge&&<button type="button" className={styles.danger} disabled={busy} onClick={()=>onPurge(items)}>Delete permanently</button>}</div></article>;})}</div>}
 </div>;
}
