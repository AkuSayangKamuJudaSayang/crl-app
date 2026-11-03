import styles from './Coordinator.module.css';
export default function WorkspaceLoading({label='Loading…'}){return <div className={styles.loading} role="status"><span className={styles.loadingSpinner} aria-hidden="true"/><strong>{label}</strong></div>;}
