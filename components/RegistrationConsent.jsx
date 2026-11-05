'use client';
import {useState} from 'react';
import ClassDialog from './ClassDialog';
import {POLICY_UPDATED,privacySections,termsSections} from '../lib/legalContent.mjs';
import styles from './RegistrationConsent.module.css';
export default function RegistrationConsent({checked,onChange,disabled=false}){
 const [document,setDocument]=useState(null);
 return <div className={styles.root}><div className={styles.agreement}><input id="registration-agreement" aria-labelledby="registration-agreement-text" type="checkbox" required checked={checked} disabled={disabled} onChange={e=>onChange(e.target.checked)}/><div id="registration-agreement-text"><label htmlFor="registration-agreement">I agree to the </label><button type="button" onClick={()=>setDocument('terms')}>Terms and Conditions</button><span> and acknowledge the </span><button type="button" onClick={()=>setDocument('privacy')}>Privacy Notice</button><span>.</span></div></div>{document&&<ClassDialog wide showClose title={document==='terms'?'Terms and Conditions':'Privacy Notice'} onClose={()=>setDocument(null)}><article className={styles.document}><p className={styles.updated}>Updated {POLICY_UPDATED}</p>{(document==='terms'?termsSections:privacySections).map(([title,text],i)=><section key={title}><h3>{i+1}. {title}</h3><p>{text}</p></section>)}<footer><button type="button" onClick={()=>setDocument(null)}>Return to signup</button></footer></article></ClassDialog>}</div>;
}
