"use client";
import {useEffect,useRef,useState} from 'react';
import {ARCHIVE_DAY_MS,archiveRetentionLabel} from '../lib/archiveRetention.mjs';
import styles from './ClassWorkspace.module.css';
export function useArchiveNow(items,serverNow,serverReceivedAt){
 const clock=useRef({stamp:null,offset:0});
 if(serverNow&&clock.current.stamp!==serverNow){const delta=Date.parse(serverNow)-Number(serverReceivedAt||Date.now());clock.current={stamp:serverNow,offset:delta};}
 const [now,setNow]=useState(()=>Date.now()+clock.current.offset),dates=items.map(row=>row.expiresAt||'').join(',');
 useEffect(()=>{let timer;const refresh=()=>{const current=Date.now()+clock.current.offset;setNow(current);clearTimeout(timer);const waits=dates.split(',').filter(Boolean).map(value=>Date.parse(value)-current).filter(value=>value>0).map(value=>value%ARCHIVE_DAY_MS||ARCHIVE_DAY_MS);timer=setTimeout(refresh,Math.min(60000,...waits)+20);};refresh();window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);return()=>{clearTimeout(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};},[dates,serverNow,serverReceivedAt]);
 return now;
}
export default function ArchiveRetention({item,now}){return <span className={item.expiresAt?styles.retention:styles.hint}>{archiveRetentionLabel(item,now)}</span>;}
