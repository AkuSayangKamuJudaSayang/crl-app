"use client";
import {useEffect,useRef,useState} from 'react';
import ClassDialog from './ClassDialog';
import {installationHelp,isStandalonePwa,requestPwaInstall,subscribePwaInstallPrompt} from '../lib/pwaInstall';
import styles from './AppInstallButton.module.css';

const feedback={
  prompting:'Confirm the installation in your browser. You can also use the steps below.',
  accepted:'Your browser accepted the installation. Check your device for the app icon using the steps below.',
  dismissed:'Installation was cancelled. You can try again or use your browser menu.',
  unavailable:'Use your browser menu to add the app. If it is already installed, find its icon below.',
  failed:'The browser could not open its install prompt. Use the steps below or try again.',
  pending:'Finish any open browser prompt, or use the steps below.'
};
export default function AppInstallButton({app='teacher',className,children,label,panelClassName}) {
  const [standalone,setStandalone]=useState(false),[open,setOpen]=useState(false),[outcome,setOutcome]=useState('unavailable');
  const [available,setAvailable]=useState(false),[help,setHelp]=useState(null);
  const mounted=useRef(false),attempt=useRef(0);
  useEffect(()=>{
    mounted.current=true;setHelp(installationHelp(app));
    const sync=()=>{setStandalone(isStandalonePwa());setAvailable(Boolean(getPrompt()));};
    let prompt=null;const getPrompt=()=>prompt;
    const unsubscribe=subscribePwaInstallPrompt(value=>{prompt=value;sync();},app);
    const media=window.matchMedia?.('(display-mode: standalone), (display-mode: minimal-ui), (display-mode: window-controls-overlay)');
    window.addEventListener('pageshow',sync);window.addEventListener('focus',sync);media?.addEventListener?.('change',sync);sync();
    return()=>{mounted.current=false;attempt.current++;unsubscribe();window.removeEventListener('pageshow',sync);window.removeEventListener('focus',sync);media?.removeEventListener?.('change',sync);};
  },[app]);
  const install=()=>{
    const id=++attempt.current;
    const result=requestPwaInstall(app); // Must run during this click, before any await.
    setHelp(installationHelp(app));setOutcome('prompting');setOpen(true);
    result.then(value=>{if(mounted.current&&id===attempt.current)setOutcome(value==='standalone'?'accepted':value);});
  };
  if(standalone)return null;
  const name=app==='learner'?'CRL-App Learner':'CRL-App Teacher';
  const trigger=<button type="button" className={className||styles.trigger} aria-label={label||`Install ${name}`} aria-haspopup="dialog" aria-expanded={open} onClick={install}>{children||`Install ${name}`}</button>;
  return <>{panelClassName?<section className={panelClassName+' '+styles.installPanel}>{trigger}</section>:trigger}
    {open&&help&&<ClassDialog title={`Install ${help.name}`} showClose onClose={()=>setOpen(false)}><div className={styles.content}>
      <p className={styles.feedback} role="status">{feedback[outcome]||feedback.unavailable}</p>
      {help.embedded&&<p>Open this page in your regular browser using its menu. An in-app browser may not offer installation.</p>}
      <ol>{help.steps.map(step=><li key={step}>{step}</li>)}</ol>
      <section className={styles.find}><h3>Cannot find the icon?</h3><p>{help.find}</p><p>Downloading or saving offline pages alone does not add a Home screen icon.</p></section>
      <label className={styles.link}>App page<input readOnly value={typeof window==='undefined'?help.url:new URL(help.url,window.location.origin).href} onFocus={e=>e.target.select()} aria-label={`${help.name} app link`}/></label>
      <div className={styles.actions}><button type="button" onClick={()=>setOpen(false)}>Close</button><button type="button" className={styles.primary} disabled={outcome==='prompting'} onClick={install}>{available?'Install app':'Try install again'}</button></div>
    </div></ClassDialog>}
  </>;
}
