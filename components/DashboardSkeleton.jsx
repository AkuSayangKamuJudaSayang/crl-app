import styles from './DashboardSkeleton.module.css';
import {SCORESHEET_GRID_WIDTHS} from '../lib/recordViewModel.mjs';

// Decorative geometry only: no invented records, values or actionable controls.
const Shape = ({kind='line',width}) => <span className={styles.shape+' '+styles[kind]} style={width?{width}:undefined}/>;
const Lines = () => <div className={styles.lines}><Shape kind="wide"/><Shape/></div>;
const Buttons = ({count=2}) => <div className={styles.buttons}>{Array.from({length:count},(_,i)=><Shape kind="button" key={i}/>)}</div>;
const Heading = ({actions=1}) => <div className={styles.heading}><Shape kind="title"/>{actions>0&&<Buttons count={actions}/>}</div>;
const Fields = () => <div className={styles.fields}>{[0,1].map(i=><div className={styles.fieldGroup} key={i}><Shape/><Shape kind="field"/></div>)}</div>;
function Metrics({count=4}){return <div className={styles.metrics} data-skeleton-part="metrics">{Array.from({length:count},(_,i)=><div className={styles.card} key={i}><Shape kind="metric"/><Shape kind="wide"/></div>)}</div>;}
function List({rows,avatar=false,actions=1,boxed=false}){return <div className={styles.list} data-skeleton-part="list">{Array.from({length:rows},(_,i)=><div className={styles.row+' '+(boxed?styles.boxed:'')} key={i}>{avatar&&<Shape kind="avatar"/>}<Lines/><Buttons count={actions}/></div>)}</div>;}
function Table({rows=5,columns=8,widths}){return <div className={styles.table} data-skeleton-part="table">{Array.from({length:rows+1},(_,i)=><div className={styles.tableRow} style={{gridTemplateColumns:widths?widths.map(w=>w+'fr').join(' '):'repeat('+columns+',minmax(0,1fr))'}} key={i}>{Array.from({length:columns},(_,j)=><Shape key={j} width={i===0?'65%':'80%'}/>)}</div>)}</div>;}
function RosterRows({rows=5,management=false}){const columns=management?9:8;const grid={gridTemplateColumns:'repeat('+columns+',minmax(0,1fr))'};return <div className={styles.rosterTable} data-skeleton-part="roster-table"><div className={styles.rosterHeader} style={grid}>{Array.from({length:columns},(_,i)=><Shape key={i}/>)}</div>{Array.from({length:rows},(_,i)=><div className={styles.rosterRow} style={grid} key={i}>{Array.from({length:columns},(_,j)=><div className={styles.rosterCell} key={j}><span className={styles.rosterLabel}><Shape/></span><Shape kind="wide"/></div>)}</div>)}</div>;}
function Scoresheet({rows}){return <div className={styles.scoresheetClip} data-skeleton-part="scoresheet"><div className={styles.scoresheetGhost} style={{minWidth:SCORESHEET_GRID_WIDTHS.reduce((sum,w)=>sum+w,0)}}><div className={styles.scoreGroups}>{[0,1,2,3].map(i=><Shape kind="wide" key={i}/>)}</div><Table rows={rows} columns={SCORESHEET_GRID_WIDTHS.length} widths={SCORESHEET_GRID_WIDTHS}/></div></div>;}
function Overview(){return <div className={styles.overview} data-skeleton-part="overview"><div className={styles.overviewDisclosure}><Shape kind="title"/><Shape kind="number"/></div><div className={styles.overviewBody}><Metrics count={6}/><div className={styles.latest}><Heading actions={0}/><Shape kind="wide"/><Table rows={5} columns={2}/></div></div></div>;}
function Menu({count=6}){return <div className={styles.menu} data-skeleton-part="menu">{Array.from({length:count},(_,i)=><div className={styles.menuCard} key={i}><Shape kind="icon"/><Lines/></div>)}</div>;}
function Scope({management=false}){return <div className={styles.scope} data-skeleton-part="class-scope"><Shape kind="title"/><Fields/>{management&&<div className={styles.scopeActions}><Buttons count={3}/></div>}</div>;}
function Library({editable}){return <><div className={styles.libraryTabs}><Buttons count={3}/><Buttons count={3}/></div><Heading actions={editable?2:0}/>{editable?<div className={styles.selection}><Shape/>{[0,1].map(i=><div className={styles.card} key={i}><Shape/><Shape kind="wide"/></div>)}</div>:<Shape kind="wide"/>}<div className={styles.libraryRows+' '+(editable?styles.editable:'')} data-skeleton-part="library-items">{Array.from({length:6},(_,i)=><div className={styles.libraryRow} key={i}><Shape kind="number"/><Shape kind="item"/>{editable&&<><Shape kind="checkbox"/><Buttons count={2}/></>}</div>)}</div></>;}
function Evidence(){return <><Metrics/><div className={styles.evidence}>{[0,1,2].map(i=><div className={styles.card} key={i}><Heading actions={0}/><List rows={i===2?3:5} actions={0}/></div>)}</div></>;}

export default function DashboardSkeleton({label='Loading workspace…',variant='table',rows=5,announce=true,editable=false,management=false}){
 let content;
 switch(variant){
  case 'teacher-home':content=<div className={styles.teacherHome}><Overview/><Menu/></div>;break;
  case 'teacher-overview':content=<Overview/>;break;
  case 'admin-overview':case 'dashboard':content=<><Metrics/><section className={styles.panel}><Heading/><List rows={3}/></section><section className={styles.panel}><Heading actions={0}/><Fields/><List rows={4}/></section></>;break;
  case 'coordination':content=<><Buttons count={4}/><section className={styles.panel}><Heading actions={0}/><Fields/><List rows={3} avatar boxed/></section></>;break;
  case 'teachers':content=<List rows={rows} avatar boxed/>;break;
  case 'teacher-choices':content=<List rows={3} avatar actions={0}/>;break;
  case 'years':content=<List rows={3} boxed/>;break;
  case 'class-scope':case 'fields':content=<Scope management={management}/>;break;
  case 'class-cards':content=<div className={styles.classCards}>{[0,1,2].map(i=><div className={styles.card} key={i}><Lines/><Buttons count={1}/></div>)}</div>;break;
  case 'library':content=<Library editable={editable}/>;break;
  case 'roster':content=<section className={styles.panel}><div className={styles.centerHeading}><Shape kind="title"/><Shape/><Shape kind="title"/></div><Buttons count={management?4:2}/><div className={styles.filters}>{[0,1,2,3].map(i=><Shape kind="field" key={i}/>)}</div>{management&&<Buttons/>}<RosterRows rows={rows} management={management}/></section>;break;
  case 'records':content=<section className={styles.panel}><div className={styles.centerHeading}><Shape kind="title"/><Shape/><Shape kind="title"/></div><div className={styles.recordsToolbar}><Buttons count={3}/><Buttons count={3}/><Buttons/></div><Scoresheet rows={rows}/></section>;break;
  case 'roster-rows':content=<RosterRows rows={rows}/>;break;
  case 'audit':content=<div className={styles.audit}><section className={styles.panel}><Fields/><List rows={4} actions={0}/></section><section className={styles.panel}><Heading actions={0}/><List rows={rows}/></section></div>;break;
  case 'audit-list':content=<List rows={rows}/>;break;
  case 'unlock':content=<List rows={rows} actions={2}/>;break;
  case 'recovery-menu':content=<div className={styles.recoveryMenu}><Menu count={2}/></div>;break;
  case 'archives':case 'backups':content=<List rows={3} actions={3}/>;break;
  case 'reports':content=<div className={styles.reports}>{[0,1].map(i=><section className={styles.panel} key={i}><Heading actions={0}/>{[0,1].map(j=><div className={styles.report} key={j}><Lines/><Shape kind="wide"/><Shape kind="wide"/><Buttons/></div>)}</section>)}</div>;break;
  case 'result':content=<Evidence/>;break;
  case 'chart':content=<><Heading actions={0}/><div className={styles.chart}>{[45,72,35,85,60,48].map((height,i)=><span className={styles.shape} key={i} style={{height:height+'%'}}/>)}</div></>;break;
  case 'passage':content=<div className={styles.passage}>{['100%','100%','94%','100%','67%'].map((width,i)=><Shape kind="wide" width={width} key={i}/>)}</div>;break;
  case 'inline':content=<div className={styles.inline}><Shape/><Shape/></div>;break;
  default:content=<Table rows={rows}/>;
 }
 return <div className={styles.skeleton+' '+(styles[variant+'Root']||'')} data-skeleton={variant} role={announce?'status':undefined} aria-label={announce?label:undefined} aria-busy={announce?true:undefined}><span className={styles.srOnly}>{label}</span><div className={styles.canvas} aria-hidden="true">{content}</div></div>;
}
