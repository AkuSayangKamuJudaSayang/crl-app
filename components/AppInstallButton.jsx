"use client";
import {useEffect,useRef,useState} from 'react';
import ClassDialog from './ClassDialog';
import {installationHelp,isStandalonePwa,requestPwaInstall,subscribePwaInstallPrompt} from '../lib/pwaInstall';
import styles from './AppInstallButton.module.css';
import {checkPwaReadiness} from '../lib/pwaReadiness';

const feedback={
  prompting:'Confirm the installation in your browser. You can also use the steps below.',
  accepted:'Your browser accepted the installation. Your device may still be adding the app. Check for its icon.',
  delayed:'Still no icon? Check the app files below or add a Home-screen shortcut.',
  dismissed:'Installation was cancelled. You can try again or use your browser menu.',
  unavailable:'Use your browser menu to add the app. If it is already installed, find its icon below.',
  failed:'The browser could not open its install prompt. Use the steps below or try again.',
  pending:'Finish any open browser prompt, or use the steps below.'
};
export default function AppInstallButton({app='teacher',className,children,label,panelClassName}) {
  const [standalone,setStandalone]=useState(false),[open,setOpen]=useState(false),[outcome,setOutcome]=useState('unavailable');
  const [available,setAvailable]=useState(false),[help,setHelp]=useState(null);
  const [troubleshoot,setTroubleshoot]=useState(false),[checking,setChecking]=useState(false),[checks,setChecks]=useState(null);
  const mounted=useRef(false),attempt=useRef(0);
  const checkAttempt=useRef(0);
  useEffect(()=>{
    if(!open||outcome!=='accepted'||!help?.androidChrome)return;
    const timer=setTimeout(()=>setOutcome('delayed'),30000);
    return()=>clearTimeout(timer);
  },[open,outcome,help?.androidChrome]);
  useEffect(()=>{
    mounted.current=true;setHelp(installationHelp(app));
    const sync=()=>{setStandalone(isStandalonePwa());setAvailable(Boolean(getPrompt()));};
    let prompt=null;const getPrompt=()=>prompt;
    const unsubscribe=subscribePwaInstallPrompt(value=>{prompt=value;sync();},app);
    const media=window.matchMedia?.('(display-mode: standalone), (display-mode: minimal-ui), (display-mode: window-controls-overlay)');
    window.addEventListener('pageshow',sync);window.addEventListener('focus',sync);media?.addEventListener?.('change',sync);sync();
    return()=>{mounted.current=false;attempt.current++;checkAttempt.current++;unsubscribe();window.removeEventListener('pageshow',sync);window.removeEventListener('focus',sync);media?.removeEventListener?.('change',sync);};
  },[app]);
  const install=()=>{
    const id=++attempt.current;
    const result=requestPwaInstall(app); // Must run during this click, before any await.
    setHelp(installationHelp(app));setOutcome('prompting');setOpen(true);
    result.then(value=>{if(mounted.current&&id===attempt.current)setOutcome(value==='standalone'?'accepted':value);});
  };
  const checkFiles=async()=>{
    const id=++checkAttempt.current;setChecking(true);setChecks(null);
    try{const value=await checkPwaReadiness(app);if(mounted.current&&id===checkAttempt.current)setChecks(value);}
    finally{if(mounted.current&&id===checkAttempt.current)setChecking(false);}
  };
  if(standalone)return null;
  const name=app==='learner'?'CRL-App Learner':'CRL-App Teacher';
  const trigger=<button type="button" className={className||styles.trigger} aria-label={label||`Install ${name}`} aria-haspopup="dialog" aria-expanded={open} onClick={install}>{children||`Install ${name}`}</button>;
  return <>{panelClassName?<section className={panelClassName+' '+styles.installPanel}>{trigger}</section>:trigger}
    {open&&help&&<ClassDialog title={`Install ${help.name}`} showClose onClose={()=>setOpen(false)}><div className={styles.content}>
      <p className={styles.feedback} role="status">{feedback[outcome]||feedback.unavailable}</p>
      {help.androidChrome&&<section className={styles.troubleshoot} aria-label="Android installation help">
        <h3>Stuck on “Installing”?</h3>
        <p>Chrome installs the Android app separately. This page cannot finish or cancel that device installation.</p>
        <div className={styles.tools}><button type="button" onClick={()=>setTroubleshoot(value=>!value)} aria-expanded={troubleshoot}>Add Home-screen shortcut</button><button type="button" disabled={checking} onClick={checkFiles}>{checking?'Checking app files…':'Check app files'}</button></div>
        {(troubleshoot||outcome==='delayed')&&<div className={styles.shortcut}>
          <h3>Add an icon without waiting</h3>
          <ol><li>Close the install dialog and stay on this app page in Chrome.</li><li>Tap Chrome’s three-dot menu, then Install and create shortcut → Create shortcut. Older versions may show Add to Home screen.</li><li>Keep the app name and tap Add. Confirm Add to Home screen if your phone asks.</li></ol>
          <p>The shortcut opens this app in Chrome. It uses the same saved assessments and offline data.</p>
          <p>For the full app, finish or cancel any pending Chrome installation if offered, check your internet connection and free device storage, and update Chrome and Google Play Store before retrying. Keep this site’s data to protect unsynced work.</p>
        </div>}
        {checks&&<div className={styles.checks} role="status">
          <ul><li>App manifest: {checks.manifest?'ready':'not available — reconnect and check again'}</li><li>App icons: {checks.icons?'ready':'not available — reconnect and check again'}</li><li>Offline worker: {checks.offline?'active':'not active yet — open the app online'}</li></ul>
          <p>{checks.manifest&&checks.icons?'The app files are ready in this browser. If Chrome still says Installing, use Create shortcut or check the Android installer.':'App files could not all be verified. Reconnect to the internet and check again.'} This check cannot confirm a Home-screen icon.</p>
        </div>}
      </section>}
      {help.embedded&&<p>Open this page in your regular browser using its menu. An in-app browser may not offer installation.</p>}
      <ol>{help.steps.map(step=><li key={step}>{step}</li>)}</ol>
      <section className={styles.find}><h3>Cannot find the icon?</h3><p>{help.find}</p><p>Downloading or saving offline pages alone does not add a Home screen icon.</p></section>
      <label className={styles.link}>App page<input readOnly value={typeof window==='undefined'?help.url:new URL(help.url,window.location.origin).href} onFocus={e=>e.target.select()} aria-label={`${help.name} app link`}/></label>
      <div className={styles.actions}><button type="button" onClick={()=>setOpen(false)}>Close</button><button type="button" className={styles.primary} disabled={outcome==='prompting'} onClick={install}>{available?'Install app':'Try install again'}</button></div>
    </div></ClassDialog>}
  </>;
}
