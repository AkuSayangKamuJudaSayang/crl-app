'use client';
import ClassDialog from './ClassDialog';
import styles from './Coordinator.module.css';
export default function NoticeDialog({message,onClose}){
 return <ClassDialog title="Notice" onClose={onClose}><div className={styles.noticeBody}><p role="alert">{message}</p><div className={styles.dialogActions}><button type="button" className={styles.primary} onClick={onClose}>Okay</button></div></div></ClassDialog>;
}
