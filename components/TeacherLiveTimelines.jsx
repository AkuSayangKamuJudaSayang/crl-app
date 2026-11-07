'use client';
import {useEffect,useMemo,useState} from 'react';
import {formatScheduleDate,scheduleIsLive,scheduleStatus,formatScheduleInstant,scheduleBounds} from '../lib/assessmentSchedule.mjs';
import styles from './TeacherLiveTimelines.module.css';
export default function TeacherLiveTimelines({catalog,loaded}){
 const [clock,setClock]=useState(Date.now());
 useEffect(()=>{setClock(Date.now());const timer=setInterval(()=>setClock(Date.now()),15000);return()=>clearInterval(timer);},[catalog]);
 const offset=useMemo(()=>catalog?.serverNow?Date.parse(catalog.serverNow)-(catalog.serverReceivedAt||Date.now()):0,[catalog?.serverNow,catalog?.serverReceivedAt]),now=clock+offset;
 const assigned=a=>(catalog?.schoolYears||[]).some(y=>y.id===a.schoolYearId&&!y.archivedAt)&&(catalog?.sections||[]).some(s=>s.schoolYearId===a.schoolYearId&&!s.archivedAt);
 // Display metadata is separate from signed permission to start an assessment.
 const timelines=(catalog?.assessmentTimelines||[]).filter(assigned),live=timelines.filter(a=>scheduleIsLive(a,now));
 const authorities=(catalog?.assessmentAuthorities||[]).filter(a=>assigned(a)&&Date.parse(a.expiresAt)>now&&(scheduleBounds(a).start===null||now>=scheduleBounds(a).start)&&(scheduleBounds(a).end===null||now<scheduleBounds(a).end));
 const current=live.length?live:authorities,upcoming=timelines.filter(a=>a.scheduleEnabled&&!a.schedulePaused&&['Scheduled','Waiting'].includes(scheduleStatus(a,now))).sort((a,b)=>(scheduleBounds(a).start||0)-(scheduleBounds(b).start||0));
 const shown=current.length?current:upcoming.filter((a,i)=>upcoming.findIndex(b=>b.schoolYearId===a.schoolYearId)===i);
 return <section className={styles.panel} aria-label="Current live assessment timelines" aria-live="polite"><div className={styles.heading}><span className={styles.dot} aria-hidden="true"/><strong>Live assessment</strong></div>{!loaded?<p>Loading assessment timelines…</p>:shown.length?<ul>{shown.map(a=>{const year=catalog.schoolYears.find(y=>y.id===a.schoolYearId),pending=!current.length;return <li key={`${a.schoolYearId}-${a.period}`}><div className={styles.identity}><strong>{a.period}</strong><span>SY {year.label||`${year.startYear}–${year.startYear+1}`}</span>{pending&&<small className={styles.scheduled}>{scheduleStatus(a,now)}</small>}</div><dl className={styles.dates}><div><dt>Start:</dt><dd>{formatScheduleInstant(a.startsAt)||(a.startsOn?formatScheduleDate(a.startsOn):'Not recorded')}</dd></div><div><dt>End:</dt><dd>{formatScheduleInstant(a.endsAt)||(a.endsOn?`${formatScheduleDate(a.endsOn)} · 11:59 PM`:'Not set by your coordinator')}</dd></div></dl></li>;})}</ul>:<p>No live assessment timeline.</p>}</section>;
}
