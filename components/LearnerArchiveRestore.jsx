"use client";
import Select from './Select';
import { useRef, useState } from "react";
import ArchiveRetention,{useArchiveNow} from './ArchiveRetention';
import ArchiveRecordPreview from './ArchiveRecordPreview';
import {archiveAvailable} from '../lib/archiveRetention.mjs';
import styles from "./ClassWorkspace.module.css";

export default function LearnerArchiveRestore({items,catalog,api,onCatalog,onReload,onBusy,disabled,onDone,onDownload,onPurge,restoreOnly=false}) {
  const single=items.length===1;
  const now=useArchiveNow(items,catalog.serverNow,catalog.serverReceivedAt);
  const selectable=items.filter(item=>!item.restoredAt&&!item.offline_pending&&archiveAvailable(item,now));
  const activeYears=(catalog.schoolYears||[]).filter(year=>!year.archivedAt);
  const initialSection=(catalog.sections||[]).find(section=>section.id===items[0]?.sourceSectionId && !section.archivedAt && activeYears.some(year=>year.id===section.schoolYearId));
  const [selected,setSelected]=useState(()=>selectable.map(item=>item.id));
  const [yearId,setYearId]=useState(initialSection?.schoolYearId || ""),[sectionId,setSectionId]=useState(initialSection?.id || ""),[error,setError]=useState("");
  const running=useRef(false);
  const sections=(catalog.sections||[]).filter(section=>section.schoolYearId===yearId && !section.archivedAt);
  const restore=async()=>{
    if(running.current||disabled||!sectionId||!selected.length||selected.some(id=>!selectable.some(row=>row.id===id)))return;
    running.current=true;onBusy(true);setError("");
    try {
      const data=await api("restore_learner_archives",{method:"POST",body:{archive_ids:selected,class_section_id:sectionId}});
      onCatalog(data);await onReload?.();onDone();
    } catch(e){setError(e.message || "Unable to restore the selected learners.");}
    finally{running.current=false;onBusy(false);}
  };
  return <div className={styles.restoreForm}>
    <p>{single?'Restore this learner with their saved assessment evidence and remarks.':'Restore the whole group, or select individual learners. Their assessment evidence and remarks are retained.'}</p>
    {single?<ArchiveRecordPreview item={items[0]} serverNow={catalog.serverNow} serverReceivedAt={catalog.serverReceivedAt}/>:<>
      <label className={styles.checkbox}><input type="checkbox" disabled={disabled || !selectable.length} checked={Boolean(selectable.length && selected.length===selectable.length)} onChange={event=>setSelected(event.target.checked?selectable.map(item=>item.id):[])} />Select all available learners</label>
      <div className={styles.restoreList}>{items.map(item=><div className={styles.restoreRow} style={restoreOnly?{gridTemplateColumns:"1fr"}:undefined} key={item.id}><label className={styles.checkbox}><input type="checkbox" disabled={disabled || Boolean(item.restoredAt) || item.offline_pending || !archiveAvailable(item,now)} checked={selected.includes(item.id)} onChange={event=>setSelected(current=>event.target.checked?[...current,item.id]:current.filter(id=>id!==item.id))}/><span><strong>{item.learnerName}</strong><small>S.Y. {item.schoolYearLabel} · {item.sectionName}{item.restoredAt?" · Restored":""}{item.offline_pending?" · Pending sync":""}</small><ArchiveRetention item={item} now={now}/></span></label>{!restoreOnly&&<button className={styles.button} type="button" disabled={disabled || item.offline_pending || !archiveAvailable(item,now)} onClick={()=>onDownload(item)}>Download backup</button>}{!restoreOnly&&onPurge&&item.expiresAt?<button className={styles.danger} type="button" disabled={disabled||item.offline_pending||!archiveAvailable(item,now)} onClick={()=>onPurge([item])}>Delete permanently</button>:null}</div>)}</div>
    </>}
    <p className={styles.hint}>If the original class was deleted or archived, choose another active school year and section. A learner already enrolled there will not be overwritten.</p>
    <label><span>Destination school year</span><Select value={yearId} disabled={disabled} onChange={event=>{setYearId(event.target.value);setSectionId("");}}><option value="">Choose School Year</option>{activeYears.map(year=><option key={year.id} value={year.id}>S.Y. {year.label}</option>)}</Select></label>
    <label><span>Destination section</span><Select value={sectionId} disabled={disabled || !yearId} onChange={event=>setSectionId(event.target.value)}><option value="">Choose Section</option>{sections.map(section=><option key={section.id} value={section.id}>{section.name}</option>)}</Select></label>
    {(!activeYears.length || yearId && !sections.length) && <p className={styles.hint}>Assign an active school year and section in Classes before restoring.</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    <div className={styles.actions} data-recovery-actions>
      {!restoreOnly&&single&&<button type="button" className={styles.button} disabled={disabled||items[0].offline_pending||!archiveAvailable(items[0],now)} onClick={()=>onDownload(items[0])}>Download backup</button>}
      {!restoreOnly&&onPurge&&<button type="button" className={styles.danger} disabled={disabled||!selected.length} onClick={()=>onPurge(items.filter(item=>selected.includes(item.id)))}>{single?'Delete permanently':'Delete selected permanently'}</button>}
      <button type="button" className={styles.primary} disabled={disabled || !sectionId || !selected.length || selected.some(id=>!selectable.some(row=>row.id===id))} onClick={restore}>{disabled?"Restoring...":single?'Restore learner':`Restore selected (${selected.length})`}</button>
    </div>
  </div>;
}
