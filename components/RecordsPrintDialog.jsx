'use client';
import {useMemo,useRef,useState} from 'react';
import ClassDialog from './ClassDialog';
import Select from './Select';
import AssessmentRecordViews from './AssessmentRecordViews';
import {rosterRecords} from '../lib/rosterRecords.mjs';
import {buildScoresheetHeader,buildClassSummaryRows,SCORESHEET_GRID_WIDTHS,CLASS_RECORD_WIDTHS,CLASS_SUMMARY_TOP_WIDTHS,CLASS_SUMMARY_DETAIL_WIDTHS} from '../lib/recordViewModel.mjs';
import {printAssessmentElement,CLEAN_PRINT_HINT} from '../lib/printRecords';
import styles from './RecordsPrintDialog.module.css';

export const CLASS_PRINT_VIEWS=[['scoresheet','Scoresheet'],['class-record','Class Record'],['summary','Class Summary']];
export const PRINT_TIMELINES=[['BoSY','Beginning of School Year'],['MoSY','Middle of School Year'],['EoSY','End of School Year']];
// A twelve-digit LRN must fit on paper without crossing into the name cell.
const PRINT_SCORESHEET_WIDTHS=SCORESHEET_GRID_WIDTHS.map((width,index)=>index===1?156:width);
const widths=(selector,columns)=>columns.map((width,index)=>`${selector} col:nth-child(${index+1}){width:${width/columns.reduce((n,value)=>n+value,0)*100}%}`).join('');
export const CLASS_RECORD_PRINT_CSS=`
 @page{size:A4 landscape;margin:0}body{margin:0;padding:0 9mm;font:8px Arial,Helvetica,sans-serif;color:#111;background:#fff}
 .classPrintPage+.classPrintPage{break-before:page}.classPrintHead{margin-bottom:4mm}.classPrintHead h1{font-size:16px;margin:0 0 2mm}.classPrintHead p{margin:1mm 0;font-size:10px}
 table{width:100%!important;min-width:0!important;table-layout:fixed;border-collapse:collapse;font:inherit}
 th,td{padding:3px 2px;border:1px solid #555;overflow-wrap:anywhere;vertical-align:middle;text-align:center}th{background:#eee;font-weight:700}
 thead{display:table-header-group}tfoot{display:table-footer-group}tr{break-inside:avoid}h2,h3{break-after:avoid}.summaryMetricGrid,.recordsNotice,.scoresheetControls{display:none!important}
 .classPrintContext>th{padding:9mm 0 4mm;border:0;background:#fff;text-align:left;font:10px Arial}.classPrintContext .classPrintHead{margin:0}.classPrintContext h1{font-size:16px;margin:0 0 2mm}.classPrintContext p{margin:1mm 0}.classPrintFoot>td{height:9mm;padding:0;border:0;background:#fff}
 .scoresheetGrid td:nth-child(2){overflow-wrap:normal;white-space:nowrap}.ssTimeHeaderParts{display:flex;justify-content:space-around}.ssTimeHeaderLayout{display:grid;gap:3px}
 .ssTitle,.classRecordWorkbookTitle{font-size:12px}.ssValue,.classRecordMetaValue{text-align:left}.classSummaryTable+.classSummaryTable,.summaryDetailTableWrap{margin-top:5mm}
 .scoresheetGrid tbody td:nth-child(3),.classRecordTable tbody td:nth-child(3){text-align:left}.classSummaryProfileCell{background:#edf4e8}
 ${widths('.scoresheetGrid',PRINT_SCORESHEET_WIDTHS)}${widths('.classRecordTable',CLASS_RECORD_WIDTHS)}${widths('.classSummaryTopTable',CLASS_SUMMARY_TOP_WIDTHS)}${widths('.classSummaryDetailTable',CLASS_SUMMARY_DETAIL_WIDTHS)}
`;

export function prepareClassPrintPages(element){
 const clone=element.cloneNode(true),doc=element.ownerDocument;
 for(const section of clone.querySelectorAll('.classPrintPage')){
  const heading=section.querySelector('.classPrintHead');
  let tableIndex=0;
  for(const table of section.querySelectorAll('table')){
   let head=table.querySelector('thead');
   // Screen scoresheets use one continuous tbody to match workbook merges.
   // Promote just its heading rows for repeated headings on printed pages.
   if(table.classList.contains('scoresheetGrid')){
    const body=table.querySelector('tbody'),rows=Array.from(body?.children||[]),last=rows.findIndex(row=>row.classList.contains('ssColumnRow'));
    if(last>=0){head=doc.createElement('thead');table.insertBefore(head,body);rows.slice(0,last+1).forEach(row=>head.appendChild(row));}
   }
   if(!head)continue;
   const count=table.querySelectorAll('col').length||1;
   if(tableIndex++===0){
    const row=doc.createElement('tr'),cell=doc.createElement('th');row.className='classPrintContext';cell.setAttribute('colspan',String(count));
    if(heading)cell.appendChild(heading.cloneNode(true));row.appendChild(cell);head.insertBefore(row,head.firstChild);
   }
   const foot=doc.createElement('tfoot'),space=doc.createElement('tr'),blank=doc.createElement('td');space.className='classPrintFoot';blank.setAttribute('colspan',String(count));space.appendChild(blank);foot.appendChild(space);table.appendChild(foot);
  }
  heading?.remove();
 }
 return clone;
}

// Render all selected sheets from one immutable scope and one selected period.
// Neither the screen's active report tab nor unsaved remark drafts enter printing.
export function ClassPrintPages({learners,assessments,selectedClass,user,yearLabel,period,choice}){
 const records=useMemo(()=>rosterRecords(learners,assessments,period),[learners,assessments,period]);
 const header=useMemo(()=>buildScoresheetHeader(learners,records),[learners,records]);
 const summary=useMemo(()=>buildClassSummaryRows(learners,records),[learners,records]);
 return <div>{CLASS_PRINT_VIEWS.filter(([view])=>choice==='all'||choice===view).map(([view,label])=><section className="classPrintPage" key={view} data-print-period={period} data-print-view={view}>
  <header className="classPrintHead"><h1>{label} · {period}</h1><p>{user?.school_name||'School'}{user?.school_id?' · School ID: '+user.school_id:''}</p><p>School Year {yearLabel} · Grade 3 · Section: {selectedClass?.name||''}</p><p>Assigned teacher: {user?.full_name||'No assigned teacher'} · Assessment language: English</p></header>
  <AssessmentRecordViews readOnly recordsView={view} currentRecords={records} currentPeriod={period} learners={learners} selectedClass={selectedClass} user={user} classSummaryRows={summary} scoresheetHeader={header} scoresheetZoom={1} scoresheetMode="view" classReadonly />
 </section>)}</div>;
}
export default function RecordsPrintDialog({scope,onClose,onError}){
 const [period,setPeriod]=useState(scope.initialPeriod||'BoSY'),[choice,setChoice]=useState('all'),[error,setError]=useState('');
 const pages=useRef(null);
 const print=()=>{setError('');try{printAssessmentElement(prepareClassPrintPages(pages.current),`${period} class reports`,{showTitle:false,css:CLASS_RECORD_PRINT_CSS,onError:e=>{setError(e.message);onError?.(e.message);}});}catch(e){setError(e.message);}};
 return <ClassDialog title="Print assessment records" showClose onClose={onClose}><div className={styles.body}>
  <p>Choose a timeline and the records to print for this section.</p><p className={styles.printHint}>{CLEAN_PRINT_HINT}</p>
  <label className={styles.field}>Assessment timeline<Select value={period} onChange={e=>setPeriod(e.target.value)}>{PRINT_TIMELINES.map(([value,meaning])=><option key={value} value={value}>{value} - {meaning}</option>)}</Select></label>
  <fieldset className={styles.choices}><legend>Records for {period}</legend>{[...CLASS_PRINT_VIEWS,['all','All records']].map(([value,label])=><label key={value}><input type="radio" name="class-print-choice" value={value} checked={choice===value} onChange={()=>setChoice(value)}/>{value==='all'?'Print All':`Print ${label}`}</label>)}</fieldset>
  {error&&<p role="alert">{error}</p>}<footer className={styles.actions}><button type="button" onClick={onClose}>Cancel</button><button type="button" onClick={print}>Print</button></footer>
  <div hidden inert aria-hidden="true"><div ref={pages}><ClassPrintPages {...scope} period={period} choice={choice}/></div></div>
 </div></ClassDialog>;
}
