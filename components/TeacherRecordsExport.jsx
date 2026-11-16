'use client';
import {useEffect,useRef,useState} from 'react';
import {buildTeacherRecordsArchive,teacherExportScope} from '../lib/teacherRecordsExport';
import {downloadBlob} from '../lib/downloadFile';
import styles from './Coordinator.module.css';
export default function TeacherRecordsExport({catalog,yearId,teacher,learners,assessments,loaded,disabled}){
 const [busy,setBusy]=useState(false),[progress,setProgress]=useState(null),[error,setError]=useState('');
 const generation=useRef(0),pending=useRef(false),{year,sections}=teacherExportScope(catalog,yearId,teacher?.id);
 useEffect(()=>{generation.current++;setBusy(false);setProgress(null);setError('');pending.current=false;return()=>{generation.current++;};},[yearId,teacher?.id]);
 if(!loaded||!year||!sections.length)return null;
 const exportAll=async()=>{
  if(pending.current)return;pending.current=true;const request=++generation.current;setBusy(true);setError('');
  try{const blob=await buildTeacherRecordsArchive({catalog,yearId,teacher,learners,assessments,isCurrent:()=>request===generation.current,onProgress:value=>{if(request===generation.current)setProgress(value);}});if(blob&&request===generation.current)downloadBlob(blob,`CRLA_${year.label}_${sections.length}_Sections_All_Records.zip`);}
  catch(e){if(request===generation.current)setError(e.message);}
  finally{if(request===generation.current){pending.current=false;setBusy(false);setProgress(null);}}
 };
 return <div style={{gridColumn:'1 / -1'}}><button type="button" className="toolbarButton exportGreenButton" disabled={busy||disabled} onClick={exportAll}>{busy?'Please wait…':'Export All Sections'}</button>{progress&&<p role="status">{progress.done===progress.total?'Packaging records…':`Preparing ${progress.done} of ${progress.total} workbooks…`}</p>}{error&&<p role="alert" className={styles.error}>{error}</p>}</div>;
}
