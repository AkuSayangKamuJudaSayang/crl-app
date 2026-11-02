"use client";
import {useState} from 'react';
import styles from './Coordinator.module.css';
export default function TeacherAvatar({name='',photo=null,large=false}){const [broken,setBroken]=useState(null),valid=typeof photo==='string'&&/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(photo)&&photo!==broken;return <span className={`${styles.avatar} ${large?styles.avatarLarge:''}`} aria-label={valid?`${name||'Teacher'} profile picture`:`${name||'Teacher'} initial`}>{valid?<img src={photo} alt="" onError={()=>setBroken(photo)}/>:String(name||'T').trim().charAt(0).toUpperCase()}</span>;}
