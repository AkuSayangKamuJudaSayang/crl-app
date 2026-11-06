'use client';
import {useEffect,useMemo,useState} from 'react';
import {formatScheduleDate} from '../lib/assessmentSchedule.mjs';
import styles from './TeacherLiveTimelines.module.css';
export default function TeacherLiveTimelines({catalog,loaded}){
 const [clock,setClock]=useState(Date.now());
 useEffect(()=>{const timer=setInterval(()=>setClock(Date.now()),15000);return()=>clearInterval(timer);},[]);
 const offset=useMemo(()=>catalog?.serverNow?Date.parse(catalog.serverNow)-(catalog.serverReceivedAt||Date.now()):0,[catalog?.serverNow,catalog?.serverReceivedAt]),now=clock+offset;
 const live=(catalog?.assessmentAuthorities||[]).filter(a=>Date.parse(a.expiresAt)>now&&(catalog?.schoolYears||[]).some(y=>y.id===a.schoolYearId&&!y.archivedAt)&&(catalog?.sections||[]).some(s=>s.schoolYearId===a.schoolYearId&&!s.archivedAt));
 return <section className={styles.panel} aria-label="Current live assessment timelines"><div className={styles.heading}><span className={styles.dot} aria-hidden="true"/><strong>Live assessment</strong></div>{!loaded?<p>Loading assessment timelines…</p>:live.length?<ul>{live.map(a=>{const year=catalog.schoolYears.find(y=>y.id===a.schoolYearId);return <li key={`${a.schoolYearId}-${a.period}`}><div><strong>{a.period}</strong><span>{year.label||`${year.startYear}–${year.startYear+1}`}</span></div><p>Ends: <span>{a.endsOn?`${formatScheduleDate(a.endsOn)} · 11:59 PM (Philippine time)`:'Not set by your coordinator'}</span></p></li>;})}</ul>:<p>No live assessment timeline.</p>}</section>;
}
