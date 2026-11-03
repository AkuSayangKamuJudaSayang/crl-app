"use client";
import {useEffect,useRef,useState} from 'react';
import ClassDialog from './ClassDialog';
import styles from './Coordinator.module.css';
const empty=()=>({id:crypto.randomUUID(),lrn:'',last_name:'',first_name:'',middle_name:'',suffix:'',sex:'Female'});
function LrnField({row,index,teacherId,api,localDuplicate,onChange,onStatus,disabled}){
 const [state,setState]=useState({kind:'empty',text:''}),[retry,setRetry]=useState(0);
 const statusRef=useRef(onStatus);statusRef.current=onStatus;
 useEffect(()=>{
  let cancelled=false;const lrn=row.lrn.trim();
  const publish=value=>{if(!cancelled){setState(value);statusRef.current(row.id,value.kind,lrn);}};
  if(!lrn){publish({kind:'empty',text:''});return;}
  if(!/^\d{10,12}$/.test(lrn)){publish({kind:'invalid',text:'Enter 10 to 12 digits.'});return;}
  if(localDuplicate){publish({kind:'duplicate',text:'This LRN is already in this batch.'});return;}
  publish({kind:'checking',text:'Checking LRN…'});
  const timer=setTimeout(()=>api('coordinator_learner_identity',{query:`&teacher_id=${teacherId}&lrn=${encodeURIComponent(lrn)}`}).then(r=>publish(r.exists?{kind:'duplicate',text:'This LRN already exists for this teacher.'}:{kind:'clear',text:'LRN available.'})).catch(()=>publish({kind:'error',text:'Unable to check LRN. Retry before saving.'})),180);
  return()=>{cancelled=true;clearTimeout(timer);};
 },[row.id,row.lrn,teacherId,localDuplicate,api,retry]);
 const invalid=['duplicate','invalid','error'].includes(state.kind);
 return <label><span className={styles.entryCaption}>LRN</span><input required aria-label={`LRN ${index+1}`} inputMode="numeric" autoComplete="off" pattern="[0-9]{10,12}" maxLength={12} value={row.lrn} disabled={disabled} aria-invalid={invalid} aria-describedby={`lrn-status-${row.id}`} onChange={e=>onChange('lrn',e.target.value)}/><span id={`lrn-status-${row.id}`} className={invalid?styles.error:styles.muted} role={invalid?'alert':'status'}>{state.text}</span>{state.kind==='error'&&<button type="button" className={styles.textButton} disabled={disabled} onClick={()=>setRetry(v=>v+1)}>Retry LRN check</button>}</label>;
}
export default function CoordinatorLearnerEntry({teacherId,sectionId,rosterVersion,api,onSaved,onClose}){
 const [rows,setRows]=useState(()=>[empty()]),[states,setStates]=useState({}),[busy,setBusy]=useState(false),[error,setError]=useState('');const pending=useRef(false),operation=useRef(crypto.randomUUID()),saved=useRef(false);
 const change=(id,key,value)=>{setRows(items=>items.map(r=>r.id===id?{...r,[key]:value}:r));operation.current=crypto.randomUUID();};
 const ready=rows.every(r=>states[r.id]?.kind==='clear'&&states[r.id]?.lrn===r.lrn.trim()&&r.first_name.trim()&&r.last_name.trim());
 const save=async e=>{e.preventDefault();if(pending.current||!ready)return;pending.current=true;setBusy(true);setError('');try{
  if(!saved.current){await api('coordinator_roster',{body:{teacher_id:teacherId,class_section_id:sectionId,roster_version:rosterVersion,roster_action:'add_learners',operation_id:operation.current,learners:rows.map(({id,...v})=>v)}});saved.current=true;}
  await onSaved();onClose();
 }catch(e){setError(saved.current?'Learners were saved. Press Save to refresh the list.':e.message);}finally{pending.current=false;setBusy(false);}};
 return <ClassDialog title="Add learners" wide showClose busy={busy} onClose={onClose}><form className={styles.batchForm} onSubmit={save}><p className={styles.muted}>Enter the learner details. All rows are saved together in the selected section.</p><div className={styles.learnerRows}>{rows.map((row,index)=><fieldset key={row.id} className={styles.learnerEntry}><legend>Learner {index+1}</legend><div className={styles.learnerFields}><LrnField row={row} index={index} teacherId={teacherId} api={api} localDuplicate={rows.some(r=>r.id!==row.id&&r.lrn.trim()===row.lrn.trim())} disabled={busy||saved.current} onChange={(key,value)=>change(row.id,key,value)} onStatus={(id,kind,lrn)=>setStates(v=>({...v,[id]:{kind,lrn}}))}/>{[['last_name','Last name',true],['first_name','First name',true],['middle_name','Middle name / initial',false],['suffix','Suffix',false]].map(([key,label,required])=><label key={key}><span className={styles.entryCaption}>{label}{!required&&<small> (optional)</small>}</span><input aria-label={`${label} ${index+1}`} required={required} maxLength={key==='suffix'?20:50} value={row[key]} disabled={busy||saved.current} onChange={e=>change(row.id,key,e.target.value)}/></label>)}<label><span className={styles.entryCaption}>Sex</span><select aria-label={`Sex ${index+1}`} value={row.sex} disabled={busy||saved.current} onChange={e=>change(row.id,'sex',e.target.value)}><option>Female</option><option>Male</option></select></label>{rows.length>1&&<button type="button" className={styles.deleteOutline} aria-label={`Remove learner ${index+1}`} disabled={busy||saved.current} onClick={()=>{setRows(v=>v.filter(r=>r.id!==row.id));operation.current=crypto.randomUUID();}}>×</button>}</div></fieldset>)}</div><button type="button" className={styles.secondary} disabled={busy||rows.length>=100||saved.current} onClick={()=>{setRows(v=>[...v,empty()]);operation.current=crypto.randomUUID();}}>+ Add another learner</button>{error&&<p role="alert" className={styles.error}>{error}</p>}<div className={styles.dialogActions}><button type="button" className={styles.secondary} disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className={styles.primary} disabled={busy||!ready}>{busy?'Saving…':`Save ${rows.length} learner${rows.length===1?'':'s'}`}</button></div></form></ClassDialog>;
}
