import styles from './DashboardSkeleton.module.css';
const Line=({wide=false})=><span className={`${styles.shape} ${wide?styles.wide:styles.line}`}/>;
export default function DashboardSkeleton({label='Loading workspace…',variant='table',rows=5,announce=true}){
 const content=<div aria-hidden="true" className={styles.canvas}>
  {variant==='inline'?<div className={styles.inline}><Line/><Line/></div>:<>
   <div className={styles.heading}><Line wide/><span className={`${styles.shape} ${styles.button}`}/></div>
   {variant==='dashboard'&&<div className={styles.cards}>{[0,1,2,3].map(i=><div key={i} className={styles.card}><span className={`${styles.shape} ${styles.metric}`}/><Line/></div>)}</div>}
   {variant==='fields'?<div className={styles.fields}>{[0,1].map(i=><div className={styles.card} key={i}><Line/><span className={`${styles.shape} ${styles.field}`}/></div>)}</div>:variant==='chart'?<div className={styles.chart}>{[45,72,35,85,60,48].map((height,i)=><span className={styles.shape} key={i} style={{height:height+'%'}}/>)}</div>:<div className={styles.panel}><div className={styles.toolbar}><span className={`${styles.shape} ${styles.field}`}/><span className={`${styles.shape} ${styles.button}`}/></div><div className={styles.rowList}>{Array.from({length:rows},(_,i)=><div className={styles.row} key={i}><span className={`${styles.shape} ${styles.avatar}`}/><div className={styles.rowText}><Line wide/><Line/></div><span className={`${styles.shape} ${styles.badge}`}/></div>)}</div></div>}
  </>}
 </div>;
 return <div className={`${styles.skeleton} ${variant==='inline'?styles.small:''}`} data-skeleton={variant} role={announce?'status':undefined} aria-label={announce?label:undefined} aria-busy={announce?true:undefined}>{announce&&<span className={styles.srOnly}>{label}</span>}{content}</div>;
}
