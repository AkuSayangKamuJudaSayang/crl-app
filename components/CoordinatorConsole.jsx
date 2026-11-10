'use client';
import {forwardRef,useCallback,useImperativeHandle,useRef,useState} from 'react';
import AssessmentLibrary from './AssessmentLibrary';
import CoordinatorLearnerRecords from './CoordinatorLearnerRecords';
import SchoolAssessmentActivation from './SchoolAssessmentActivation';
import UnsavedChangesDialog from './UnsavedChangesDialog';
import styles from './Coordinator.module.css';
const PANELS=['Assessment','Records','Assessment Contents'];
const CoordinatorConsole=forwardRef(function CoordinatorConsole({api,onDirtyChange,onOpenLive},ref){
 const [panel,setPanel]=useState('Assessment'),[refresh,setRefresh]=useState(0),[dirty,setDirty]=useState(false),[next,setNext]=useState(null);
 const library=useRef(null);
 const dirtyChange=useCallback(value=>{setDirty(value);onDirtyChange?.(value);},[onDirtyChange]);
 useImperativeHandle(ref,()=>({
  save:()=>library.current?.save(),
  discard:()=>library.current?.discard(),
  warnIfInvalid:()=>library.current?.warnIfInvalid(),
  notifySaveError:reason=>library.current?.notifySaveError(reason),
  refresh:()=>{if(dirty)return;setRefresh(value=>value+1);library.current?.reload();}
 }),[dirty]);
 const change=destination=>{
  if(destination===panel)return;
  if(dirty){library.current?.warnIfInvalid();setNext(destination);return;}
  setPanel(destination);
 };
 const finish=()=>{setPanel(next);setNext(null);};
 return <div className={styles.root}>
  <nav className={styles.toolbar} aria-label="Reading coordination">{PANELS.map(item=><button key={item} aria-current={panel===item?'page':undefined} onClick={()=>change(item)}>{item}</button>)}</nav>
  {panel==='Assessment'?<SchoolAssessmentActivation api={api} refreshKey={refresh}/>:null}
  {panel==='Records'?<CoordinatorLearnerRecords api={api} refreshKey={refresh}/>:null}
  {panel==='Assessment Contents'?<AssessmentLibrary ref={library} api={api} editable onOpenLive={onOpenLive} onDirtyChange={dirtyChange} onBack={()=>change('Assessment')}/>:null}
  {next?<UnsavedChangesDialog onSaveError={reason=>library.current?.notifySaveError(reason)} onSave={async()=>{await library.current.save();finish();}} onKeepEditing={()=>setNext(null)} onDiscard={()=>{library.current?.discard();finish();}}/>:null}
 </div>;
});
export default CoordinatorConsole;
