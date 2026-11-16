'use client';
import {useEffect,useRef,useState} from 'react';
import ClassDialog from './ClassDialog';
import Select from './Select';
import {printAssessmentElement,CLEAN_PRINT_HINT} from '../lib/printRecords';
import styles from './RecordsPrintDialog.module.css';
export const CLASS_PRINT_VIEWS=[['scoresheet','Scoresheet'],['class-record','Class Record'],['summary','Class Summary']];
export const PRINT_TIMELINES=[['BoSY','Beginning of School Year'],['MoSY','Middle of School Year'],['EoSY','End of School Year']];
export default function RecordsPrintDialog({scope,onClose,onError}){
 const [period,setPeriod]=useState(scope.initialPeriod||'BoSY'),[choice,setChoice]=useState('all'),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const request=useRef(0);useEffect(()=>()=>{request.current++;},[]);
 const print=async()=>{if(busy)return;const generation=++request.current;setError('');setBusy(true);
  try{
   const [{buildOfflineAssessmentWorkbook},{readWorkbookPrintModel,createWorkbookPrintPages}]=await Promise.all([import('../lib/offlineExcelExport'),import('../lib/workbookPrint.mjs')]);
   const blob=await buildOfflineAssessmentWorkbook({teacher:{...scope.user,section:scope.selectedClass.name,schoolYear:scope.yearLabel,classSectionId:scope.selectedClass.id},learners:scope.learners,assessments:scope.assessments,period});
   const model=await readWorkbookPrintModel(await blob.arrayBuffer(),choice==='all'?CLASS_PRINT_VIEWS.map(([view])=>view):[choice]);
   if(generation!==request.current)return;
   const pages=createWorkbookPrintPages(document,model);
   printAssessmentElement(pages.element,`${period} class reports`,{showTitle:false,css:pages.css,onError:e=>{if(generation===request.current){setError(e.message);onError?.(e.message);}}});
  }catch(e){if(generation===request.current){setError(e.message);onError?.(e.message);}}
  finally{if(generation===request.current)setBusy(false);}
 };
 return <ClassDialog title="Print assessment records" showClose onClose={onClose}><div className={styles.body}>
  <p>Choose a timeline and the records to print for this section. Use A4 paper in landscape orientation.</p><p className={styles.printHint}>{CLEAN_PRINT_HINT}</p>
  <label className={styles.field}>Assessment timeline<Select disabled={busy} value={period} onChange={e=>setPeriod(e.target.value)}>{PRINT_TIMELINES.map(([value,meaning])=><option key={value} value={value}>{value} - {meaning}</option>)}</Select></label>
  <fieldset disabled={busy} className={styles.choices}><legend>Records for {period}</legend>{[...CLASS_PRINT_VIEWS,['all','All records']].map(([value,label])=><label key={value}><input type="radio" name="class-print-choice" value={value} checked={choice===value} onChange={()=>setChoice(value)}/>{value==='all'?'Print All':`Print ${label}`}</label>)}</fieldset>
  {error&&<p role="alert">{error}</p>}<footer className={styles.actions}><button type="button" onClick={onClose}>Cancel</button><button type="button" disabled={busy} onClick={print}>{busy?'Please wait…':'Print'}</button></footer>
 </div></ClassDialog>;
}
