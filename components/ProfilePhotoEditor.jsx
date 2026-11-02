"use client";
import {useRef,useState} from 'react';
import TeacherAvatar from './TeacherAvatar';
import styles from './Coordinator.module.css';
export default function ProfilePhotoEditor({user,onChange}){
 const input=useRef(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const save=async(file=null)=>{if(busy)return;setError('');if(!navigator.onLine){setError('Connect to the internet to update your profile picture.');return;}if(file&&(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>2*1024*1024)){setError('Choose a JPEG, PNG or WebP image up to 2 MB.');return;}setBusy(true);try{const form=new FormData();if(file)form.append('photo',file);else form.append('remove','true');const r=await fetch('/api/profile-photo',{method:'POST',credentials:'include',body:form,cache:'no-store'}),data=await r.json();if(!r.ok)throw Error(data.error||'Unable to save your profile picture.');onChange({...user,profile_photo:data.profile_photo});}catch(e){setError(e.message);}finally{setBusy(false);}};
 return <div className={styles.profilePhotoControl}><TeacherAvatar name={user?.full_name} photo={user?.profile_photo} large/><input type="file" accept="image/jpeg,image/png,image/webp" hidden ref={input} onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void save(f);}}/><div className={styles.photoButtons}><button className={styles.secondary} type="button" disabled={busy} onClick={()=>input.current.click()}>{busy?'Saving…':'Change picture'}</button>{user?.profile_photo&&<button className={styles.secondary} type="button" disabled={busy} onClick={()=>save()}>Remove picture</button>}</div>{error&&<p role="alert" className={styles.error}>{error}</p>}</div>;
}
