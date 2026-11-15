'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import Select from './Select';
import WorkspaceLoading from './WorkspaceLoading';
import CoordinatorRecords from './CoordinatorRecords';
import {buildCoordinatorRecordsArchive,RECORD_PERIODS} from '../lib/coordinatorRecordsExport';
import {recordSectionSelection} from '../lib/coordinatorRecordsDirectory.mjs';
import {downloadBlob} from '../lib/downloadFile';
import styles from './Coordinator.module.css';
import ui from './CoordinatorRecordDirectory.module.css';
export default function CoordinatorLearnerRecords({api,refreshKey=0}){
 const [catalog,setCatalog]=useState(null),[year,setYear]=useState(''),[sections,setSections]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[search,setSearch]=useState(''),[selected,setSelected]=useState([]),[expanded,setExpanded]=useState(''),[report,setReport]=useState(null),[reportError,setReportError]=useState(''),[exporting,setExporting]=useState(false),[progress,setProgress]=useState(null);
 const cache=useRef(new Map()),exportRequest=useRef(0);
 useEffect(()=>{let active=true;setLoading(true);api('coordinator_setup').then(data=>{if(active){setCatalog(data);setLoading(false);}}).catch(e=>{if(active){setError(e.message);setLoading(false);}});return()=>{active=false;exportRequest.current++;};},[api,refreshKey]);
 useEffect(()=>{if(year&&catalog&&!catalog.years.some(row=>String(row.startYear)===year))setYear('');},[catalog,year]);
 useEffect(()=>{let active=true;cache.current=new Map();exportRequest.current++;setExporting(false);setProgress(null);setSelected([]);setExpanded('');setReport(null);setSections(null);setError('');if(!year)return()=>{active=false;};api('coordinator_record_sections',{query:'&start_year='+encodeURIComponent(year)}).then(data=>{if(active)setSections(data.sections);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[api,year,refreshKey]);
 const loadReport=useCallback(sectionId=>{const key=year+':'+sectionId,store=cache.current;if(!store.has(key)){const promise=api('coordinator_learner_records',{query:'&start_year='+encodeURIComponent(year)+'&section_id='+encodeURIComponent(sectionId)}).catch(e=>{store.delete(key);throw e;});store.set(key,promise);}return store.get(key);},[api,year]);
 useEffect(()=>{let active=true;setReport(null);setReportError('');if(expanded)loadReport(expanded).then(result=>{if(active)setReport(result);}).catch(e=>{if(active)setReportError(e.message);});return()=>{active=false;};},[expanded,loadReport]);
 const {rows,visible,selection,allSelected,targets}=recordSectionSelection(sections,selected,search);
 const exportRecords=async()=>{
  if(exporting||!targets.length)return;const request=++exportRequest.current;setExporting(true);setError('');setProgress({done:0,total:targets.length*RECORD_PERIODS.length});
  for(const section of targets)cache.current.delete(year+':'+section.id);
  try{const archive=await buildCoordinatorRecordsArchive({sections:targets,loadReport,onProgress:value=>{if(request===exportRequest.current)setProgress(value);},isCurrent:()=>request===exportRequest.current});if(archive)downloadBlob(archive,`CRLA_${year}-${Number(year)+1}_${targets.length}_Sections_All_Records.zip`);
  }catch(e){if(request===exportRequest.current)setError(e.message);}finally{if(request===exportRequest.current){setExporting(false);setProgress(null);}}
 };
 return <section className={`${styles.panel} ${ui.root}`} aria-label="Learner Records"><h2>Learner Records</h2><label className={ui.year}>School year<Select value={year} disabled={loading||exporting} onChange={e=>{setYear(e.target.value);setSearch('');}}><option value="" hidden disabled>Select school year</option>{(catalog?.years||[]).map(row=><option key={row.startYear} value={row.startYear}>{row.label}</option>)}</Select></label>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  {loading?<WorkspaceLoading label="Loading school years…" variant="years"/>:!year?<div className={styles.learnerRecordsPrompt}><strong>Select a school year</strong><p>View its sections, assigned teachers and assessment records.</p></div>:sections===null&&!error?<WorkspaceLoading label="Loading section records…" variant="records"/>:<>
   <div className={ui.tools}><input type="search" aria-label="Search sections or teachers" placeholder="Search section or assigned teacher" value={search} disabled={exporting} onChange={e=>setSearch(e.target.value)}/><div><button type="button" disabled={exporting||!visible.length} onClick={()=>setSelected(current=>[...new Set([...current,...visible.map(row=>row.id)])])}>Select all</button><button type="button" disabled={exporting||!selection.length} onClick={()=>setSelected([])}>Deselect all</button><button type="button" className={ui.export} disabled={exporting||!rows.length} onClick={exportRecords}>{exporting?'Please wait…':selection.length&&!allSelected?'Export Selected Records':'Export All Records'}</button></div></div>
   <p className={ui.hint}>{selection.length} selected · {rows.length} sections. Exports include BoSY, MoSY and EoSY workbooks with scoresheet, class summary and class record.</p>
   {progress&&<p role="status">{progress.done===progress.total?'Packaging records for download…':`Preparing ${progress.done} of ${progress.total} workbooks…`}</p>}
   <div className={ui.list}>{visible.map(section=><article className={ui.item} key={section.id}><div className={ui.heading}><label className={ui.check}><input type="checkbox" checked={selection.includes(section.id)} disabled={exporting} aria-label={`Select ${section.name}`} onChange={()=>setSelected(current=>current.includes(section.id)?current.filter(id=>id!==section.id):[...current,section.id])}/></label><div><h3>{section.name}</h3><p>Assigned teacher: <strong>{section.assignedTeacherName||'No assigned teacher'}</strong></p><p>{section.learnerCount} enrolled learner{section.learnerCount===1?'':'s'}</p></div><button type="button" disabled={exporting} aria-expanded={expanded===section.id} onClick={()=>setExpanded(current=>current===section.id?'':section.id)}>{expanded===section.id?'Close records':'View Records'}</button></div>
    {expanded===section.id&&(reportError?<p role="alert">{reportError}</p>:!report?<WorkspaceLoading label="Loading assessment records…" variant="records"/>:<CoordinatorRecords key={year+section.id} report={report} sectionId={section.id} api={api}/>)}</article>)}</div>
   {!visible.length&&<p className={styles.learnerRecordsPrompt}>{rows.length?'No sections match your search.':'No sections are assigned to this school year.'}</p>}
  </>}
 </section>;
}
