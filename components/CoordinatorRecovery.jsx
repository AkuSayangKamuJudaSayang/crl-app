"use client";
import {useState} from 'react';
import CoordinatorArchives from './CoordinatorArchives';
import CoordinatorBackups from './CoordinatorBackups';
import styles from './Coordinator.module.css';
function RecoveryIcon({backup}){return <svg viewBox="0 0 32 32" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{backup?<><rect x="6" y="4" width="20" height="7" rx="2"/><rect x="6" y="13" width="20" height="7" rx="2"/><rect x="6" y="22" width="20" height="6" rx="2"/><path d="M10 7.5h1m-1 9h1m-1 8.5h1"/></>:<><path d="M4 9h24v5H4zM6 14v14h20V14M12 19h8M9 9V4h14v5"/></>}</svg>;}
export default function CoordinatorRecovery({api,refreshKey=0}){
 const [view,setView]=useState(null);
 return <div className={styles.recoveryRoot}>{!view?<div className={styles.recoveryChoices}>{[['archives','Archives','View and download deleted learners.'],['backups','Backups','Create named copies of selected teachers’ current records.']].map(([key,title,text])=><button key={key} className={styles.recoveryChoice} onClick={()=>setView(key)} aria-label={`Open ${title}`}><span className={styles.recoveryChoiceIcon}><RecoveryIcon backup={key==='backups'}/></span><span><strong>{title}</strong><small>{text}</small></span><span aria-hidden="true">→</span></button>)}</div>:<><button className={styles.recoveryBack} aria-label="Back to Recovery choices" onClick={()=>setView(null)}>←</button>{view==='archives'?<CoordinatorArchives api={api} refreshKey={refreshKey}/>:<CoordinatorBackups api={api} refreshKey={refreshKey}/>}</>}</div>;
}
