"use client";
import {useState} from 'react';
import ClassDialog from './ClassDialog';
import styles from './Coordinator.module.css';
export default function UnsavedChangesDialog({onSave,onKeepEditing,onDiscard,onSaveError}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const save=async()=>{if(busy)return;setBusy(true);setError('');try{await onSave();}catch(e){if(onSaveError)onSaveError(e);else setError(e.message||'Unable to save. Your changes are still here.');}finally{setBusy(false);}};
 return <ClassDialog title="Save unsaved changes?" onClose={onKeepEditing} busy={busy}><p className={styles.dialogHint}>Save your changes before leaving, keep editing, or discard them.</p>{error&&<p role="alert" className={styles.error}>{error}</p>}<div className={styles.decisionActions}><button type="button" className={styles.primary} disabled={busy} onClick={save}>{busy?'Saving…':'Save'}</button><button type="button" className={styles.secondary} disabled={busy} onClick={onKeepEditing}>Keep editing</button><button type="button" className={styles.danger} disabled={busy} onClick={onDiscard}>Discard</button></div></ClassDialog>;
}
