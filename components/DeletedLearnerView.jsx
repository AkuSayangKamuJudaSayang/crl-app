"use client";
import {useEffect,useRef,useState} from 'react';
export default function DeletedLearnerView({items,load,onDownload,busy}){
 const [data,setData]=useState(null),[error,setError]=useState('');const loader=useRef(load);loader.current=load;
 const key=items.map(row=>row.id).join(',');
 useEffect(()=>{let live=true;setData(null);setError('');Promise.resolve().then(()=>loader.current(items)).then(result=>{if(live)setData(result);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[key]);
 return <div><p>{items.length} deleted learner{items.length===1?'':'s'} · School Year {items[0]?.schoolYearLabel} · {items[0]?.sectionName}</p>{error?<p role="alert">{error}</p>:!data?<p role="status">Loading deleted learners…</p>:<ul style={{paddingLeft:20,maxHeight:'55vh',overflowY:'auto'}}>{data.learners.map((row,i)=><li key={row.id??i} style={{marginBottom:14}}><strong>{[row.lastName,row.firstName,row.middleName,row.suffix].filter(Boolean).join(', ')}</strong><p>LRN: {row.lrn} · Sex: {row.sex}</p>{(row.assessmentSessions||[]).map(record=><p key={record.id}>{record.assessmentPeriod}: {record.overallClassification||'Unclassified'} · {record.isCompleted?'Completed':'Incomplete'}</p>)}</li>)}</ul>}<button type="button" disabled={busy||!data} onClick={()=>onDownload(items)}>Download backup</button></div>;
}
