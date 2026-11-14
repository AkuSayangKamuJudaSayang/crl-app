'use client';
import {useEffect,useRef,useState} from 'react';
import ArchiveBrowser from './ArchiveBrowser';
import {archiveOwnerBatches} from '../lib/archiveBrowser.mjs';
export default function DeletedLearnerView({items,load,onDownload,onPurge,busy,clock={}}){
 const [data,setData]=useState(null),[error,setError]=useState(''),loader=useRef(load);loader.current=load;
 const key=items.map(row=>row.id).join(',');
 useEffect(()=>{let active=true;setData(null);setError('');(async()=>{const learners=[];for(const batch of archiveOwnerBatches(items)){const result=await loader.current(batch);learners.push(...result.learners);}if(active)setData({learners});})().catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[key]);
 const rows=data?items.map(item=>{const learner=data.learners.find(row=>row.archive_id===item.id)||data.learners.find(row=>String(row.id)===String(item.sourceLearnerId));return {...item,learnerName:learner?[learner.lastName,learner.firstName,learner.middleName,learner.suffix].filter(Boolean).join(', '):item.learnerName,details:learner};}):[];
 return <div>{error?<p role="alert">{error}</p>:!data?<p role="status">Loading archived learners…</p>:<ArchiveBrowser rows={rows} clock={clock} grouped={false} busy={busy} onDownload={onDownload} onPurge={onPurge}/>}</div>;
}
