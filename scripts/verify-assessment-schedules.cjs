const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),{transform}=require('next/dist/build/swc');
(async()=>{
const schedule=await import('../lib/assessmentSchedule.mjs'),{scheduleIsLive:live,scheduleStatus:status,scheduleIssue:issue,rangesOverlap:overlap,authorityExpiry,liveScheduleWhere}=schedule;
// Regression for schedule suggestions, inclusive reserved days and future periods.
const at=Date.parse('2026-11-10T08:13:00+08:00');
const mk=(period,start,end,year=2026)=>({period,startYear:year,scheduleEnabled:true,startsAt:schedule.scheduleInstant(start,'14:45'),endsAt:end?schedule.scheduleInstant(end,'08:30'):null});
const bosy=mk('BoSY','2026-11-10','2026-11-25');
const mosy=mk('MoSY','2026-11-26','2026-12-12');
const eosy=mk('EoSY','2026-12-13','2027-02-10');
assert.deepEqual(schedule.calendarRange(bosy,2026),{start:'2026-11-10',end:'2026-11-25'});
assert.equal(schedule.nextTimelineStartDay('MoSY',[bosy],2026,at),'2026-11-26','Next timeline must start the day after BoSY stops');
assert.equal(schedule.nextTimelineStartDay('EoSY',[bosy],2026,at),'2026-11-26','End of year honors every earlier booked range');
assert.equal(schedule.nextTimelineStartDay('EoSY',[bosy,mosy],2026,at),'2026-12-13','EoSY starts after MoSY ends');
assert.equal(schedule.nextTimelineStartDay('MoSY',[bosy,eosy],2026,at),'2026-11-26','Later timeline limits do not replace earlier end');
assert.equal(schedule.nextTimelineStartDay('BoSY',[mosy],2026,at),'2026-11-10','Earlier unscheduled timeline may precede a later schedule');
assert.equal(schedule.nextTimelineStartDay('EoSY',[mk('BoSY','2026-11-10',null)],2026,at),'','An open-ended earlier timeline leaves no later dates available');
assert.equal(schedule.nextTimelineStartDay('MoSY',[mk('BoSY','2026-11-10','2027-12-31')],2026,at),'','No suggestions past the school-year boundary');
assert.equal(schedule.nextTimelineStartDay('MoSY',[bosy],2027,Date.parse('2027-11-10T04:00:00Z')),'2027-11-10','Other school years never occupy dates');
assert.equal(schedule.nextTimelineStartDay('MoSY',[mk('BoSY','2027-09-30','2027-12-31',2027)],2027,Date.parse('2027-11-10T04:00:00Z')),'2028-01-01','Next year rollover is valid within the same SY');
for(const day of ['2026-11-10','2026-11-17','2026-11-25']){
 const conflict=schedule.calendarConflict({period:'MoSY',startsAt:schedule.scheduleInstant(day,'10:00'),endsAt:schedule.scheduleInstant(day,'11:00')},[bosy],2026);
 assert.equal(conflict?.reason,'overlap','Booked BoSY day '+day+' is off-limits to MoSY');
}
assert.equal(schedule.calendarConflict({period:'MoSY',startsAt:schedule.scheduleInstant('2026-11-26','09:00'),endsAt:schedule.scheduleInstant('2026-12-10','12:00')},[bosy],2026),null,'Nov 26 is a valid next start');
assert.equal(schedule.calendarConflict({period:'EoSY',startsAt:schedule.scheduleInstant('2026-12-12','09:00'),endsAt:schedule.scheduleInstant('2026-12-20','12:00')},[bosy,mosy],2026)?.reason,'overlap','MoSY end is reserved for EoSY');
const changedEnding={...bosy,endsOn:'2026-11-20'};
assert.equal(schedule.calendarRange(changedEnding,2026).end,'2026-11-25','Exact-time stop wins over a stale date-only endpoint');
const legacyEnding={...bosy,endsOn:'2026-11-25',endsAt:new Date(schedule.scheduleEndBoundary('2026-11-25')).toISOString()};
assert.equal(schedule.calendarRange(legacyEnding,2026).end,'2026-11-25','Legacy inclusive stop remains compatible');
const ui=fs.readFileSync('components/SchoolAssessmentActivation.jsx','utf8'),css=fs.readFileSync('components/Coordinator.module.css','utf8'),calendarUI=fs.readFileSync('components/TimelineCalendar.jsx','utf8'),serverCode=fs.readFileSync('lib/schoolAssignments.js','utf8');
assert.ok(ui.includes('nextTimelineStartDay(period,rows,Number(year),openedAt)'),'Dialog defaults to first available day');
assert.ok(calendarUI.includes('dayInSchoolYear(start,startYear)?start.slice(0,7)'),'Calendar opens the suggested month instead of the current month');
assert.ok(ui.includes("hasSchedule?'Edit schedule':'Set schedule'"),'Any saved schedule shows Edit schedule before Go live, after Stop, and while armed');
assert.ok(ui.includes("title={row?.scheduleEnabled?'Edit start/stop dates':'Set start/stop dates'}"),'Saved or stopped schedules open the edit dialog');
assert.ok(ui.includes("hasSchedule=Boolean(row?.scheduleEnabled&&row?.startsAt)"),'Saved schedule predicate requires an enabled schedule with a start');
assert.ok(!ui.includes("live||armed?'Edit schedule':'Set schedule'"),'Edit label must not depend on activation state');
assert.ok(ui.includes("live||armed?'Stop':outside?'Ended':'Go live'"),'Live/armed timelines use Stop');
assert.ok(ui.includes('Clear Schedule</button>')&&ui.includes('title="Clear schedule?"'),'Clearing needs the explicit secondary confirmation');
assert.ok(css.includes('.panel .pauseTimeline{background:#b3293b!important'),'Stop is a deep red, not light pink');
for(const period of ['BoSY','MoSY','EoSY'])assert.ok(css.includes('button[data-reserved='+period+']:disabled'),'Past and future reservations use soft colored bands');
assert.ok(serverCode.includes("...(legacy?{startsOn:new Date(body.starts_on+'T00:00:00Z'),endsOn:new Date(body.ends_on+'T00:00:00Z')}:{})"),'Exact-time schedules omit trigger-managed legacy date fields');
assert.ok(!serverCode.includes(':{startsOn:null,endsOn:null}'),'Never clear the start-date scalar when adding a stop to an unchanged start');
const row={isLive:true,scheduleEnabled:true,schedulePaused:false,startsOn:'2027-06-01',endsOn:'2027-08-31'};
assert.equal(live(row,Date.parse('2027-05-31T15:59:59Z')),false);assert.equal(live(row,Date.parse('2027-05-31T16:00:00Z')),true);assert.equal(live(row,Date.parse('2027-08-31T15:59:59.999Z')),true);assert.equal(live(row,Date.parse('2027-08-31T16:00:00Z')),false);assert.equal(live({...row,schedulePaused:true},Date.parse('2027-07-01')),false);assert.equal(status(row,Date.parse('2027-09-01')),'Ended');assert.equal(live({isLive:true,scheduleEnabled:false}),true);
assert.equal(overlap('2027-06-01','2027-08-31','2027-08-31','2027-09-30'),true);assert.equal(overlap('2027-06-01','2027-08-31','2027-09-01','2027-10-30'),false);assert.ok(issue('2027-02-29','2027-03-01',2027));assert.equal(issue('2028-02-29','2028-03-01',2027),'');assert.ok(issue('2028-01-01','2027-12-31',2027));assert.equal(issue('2029-01-01','2029-01-01',2027),'');assert.equal(authorityExpiry(row,Date.parse('2027-08-31T15:00:00Z')),'2027-08-31T16:00:00.000Z');assert.equal(authorityExpiry(row,Date.parse('2027-07-01T00:00:00Z')),'2027-07-02T00:00:00.000Z');
assert.equal(liveScheduleWhere(Date.parse('2027-08-31T16:00:00Z')).OR[1].startsAt.lte.toISOString(),'2027-08-31T16:00:00.000Z');
const coordinator={id:901,role:'reading_coordinator',schoolId:'123456'},shared=await import('../lib/classWorkspace.mjs');let rows=[],assessmentUpdateArgs=[];
const db={$queryRaw:async()=>[],globalSchoolYear:{findUnique:async({where})=>({startYear:where.startYear})},assessmentLibraryHead:{findUnique:async()=>({revisionId:'revision'})},schoolAssessment:{findFirst:async({where})=>rows.find(r=>r.isLive&&!(r.startYear===where.NOT.startYear&&r.period===where.NOT.period)),findUnique:async({where})=>rows.find(r=>r.startYear===where.schoolId_startYear_period.startYear&&r.period===where.schoolId_startYear_period.period),findMany:async({where})=>rows.filter(r=>r.startYear===where.startYear&&r.period!==where.period.not&&r.scheduleEnabled),create:async({data})=>{const row={revision:1,...data};rows.push(row);return row;},update:async({where,data})=>{assessmentUpdateArgs.push({...data});const row=rows.find(r=>r.startYear===where.schoolId_startYear_period.startYear&&r.period===where.schoolId_startYear_period.period),revision=row.revision+1;Object.assign(row,data,{revision});return row;}}};
db.$transaction=async fn=>{const copy=structuredClone(rows);try{return await fn(db);}catch(e){rows=copy;throw e;}};
const deps={'./assessmentSchedule.mjs':schedule,'./prisma':{prisma:db},'./schoolContext':{schoolScope:()=>coordinator.schoolId},'./classWorkspace.mjs':shared,'./classWorkspaces':{},'./adminHistory':{writeAudit:async()=>{}},'./coordinatorPolicy':{lockSharedLibrary:async()=>{},refreshSchoolScheduleState:async()=>{}},'./deletionAuthorization':{}};
const module={exports:{}},{code}=await transform(fs.readFileSync('lib/schoolAssignments.js','utf8'),{filename:'schoolAssignments.js',jsc:{parser:{syntax:'ecmascript'}},module:{type:'commonjs'}});vm.runInNewContext(code,{module,exports:module.exports,require:n=>deps[n]||require(n),Date,Number,Error});const api=module.exports;
const save=(period,start,end,revision=0,year=2027)=>api.manageSchoolAssessment({start_year:year,period,assessment_action:'schedule',schedule_enabled:true,starts_on:start,ends_on:end,expected_revision:revision},coordinator);
await save('BoSY','2027-06-01','2027-08-31');
assert.equal(rows[0].scheduleEnabled,true);
assert.equal(rows[0].schedulePaused,true,'Saving a schedule must not activate it');
assert.equal(rows[0].isLive,false);
await assert.rejects(()=>save('MoSY','2027-08-31','2027-10-30'),error=>error.status===409&&/overlap/.test(error.message));
assert.equal(rows.length,1);
await save('MoSY','2027-09-01','2027-10-30');
await assert.rejects(()=>save('EoSY','2027-05-01','2027-11-30'),/overlap/);
await assert.rejects(()=>save('BoSY','2027-06-02','2027-08-30',0),/changed/);
assert.equal(schedule.dateOnly(rows[0].startsOn),'2027-06-01');
await assert.rejects(()=>save('EoSY','2027-02-29','2027-03-01'),/valid/);
await assert.rejects(()=>save('EoSY','2027-11-01junk','2027-12-01'),/valid/);
// Go live on a future saved start arms automatic activation, not immediate access.
await api.manageSchoolAssessment({start_year:2027,period:'BoSY',assessment_action:'activate',is_live:true,expected_revision:1},coordinator);
assert.equal(rows[0].schedulePaused,false);
assert.equal(rows[0].isLive,false);
await api.manageSchoolAssessment({start_year:2027,period:'BoSY',assessment_action:'activate',is_live:false,expected_revision:rows[0].revision},coordinator);
assert.equal(rows[0].schedulePaused,true);
await api.manageSchoolAssessment({start_year:2027,period:'BoSY',assessment_action:'schedule',schedule_enabled:false,expected_revision:rows[0].revision},coordinator);
assert.equal(rows[0].startsOn,null);
await assert.rejects(()=>api.manageSchoolAssessment({start_year:2027,period:'BoSY',assessment_action:'activate',is_live:true,expected_revision:rows[0].revision},coordinator),/Set and save/);
for(const period of ['BoSY','MoSY','EoSY'])await assert.rejects(()=>api.manageSchoolAssessment({start_year:2028,period,assessment_action:'activate',is_live:true,expected_revision:0},coordinator),/Set and save/);
// An open-ended schedule is saved inactive, and then explicitly armed.
const open=await api.manageSchoolAssessment({start_year:2028,period:'BoSY',assessment_action:'schedule',schedule_enabled:true,starts_at:'2028-02-01T02:00:00Z',ends_at:null,expected_revision:0},coordinator);
assert.equal(open.assessment.endsAt,null);
assert.equal(open.assessment.schedulePaused,true);
assert.equal(open.assessment.isLive,false);
await api.manageSchoolAssessment({start_year:2028,period:'BoSY',assessment_action:'activate',is_live:true,expected_revision:open.assessment.revision},coordinator);
const openRow=rows.find(r=>r.startYear===2028&&r.period==='BoSY');
assert.equal(openRow.schedulePaused,false);
assert.equal(openRow.isLive,false,'Future starts must wait for their date/time');
await api.manageSchoolAssessment({start_year:2028,period:'BoSY',assessment_action:'activate',is_live:false,expected_revision:openRow.revision},coordinator);
// Regression: edit an open-ended exact-time schedule to add, change and
// remove its stop, without writing NULL legacy dates. The production DB
// trigger reads an explicit startsOn:null with unchanged startsAt as a
// deletion of the start, which violates its school-year constraint.
const initialExact=await api.manageSchoolAssessment({
 start_year:2030,period:'BoSY',assessment_action:'schedule',
 schedule_enabled:true,starts_at:'2030-02-01T02:00:00.000Z',ends_at:null,expected_revision:0
},coordinator);
const exactRow=rows.find(row=>row.startYear===2030&&row.period==='BoSY');
exactRow.startsOn='2030-02-01'; // mimic the DB trigger's derived date
assert.equal(initialExact.assessment.schedulePaused,true);
let lastUpdate=assessmentUpdateArgs.length;
const withEnd=await api.manageSchoolAssessment({
 start_year:2030,period:'BoSY',assessment_action:'schedule',
 schedule_enabled:true,starts_at:'2030-02-01T02:00:00.000Z',
 ends_at:'2030-03-01T15:59:00.000Z',expected_revision:exactRow.revision
},coordinator);
assert.equal(assessmentUpdateArgs.length,lastUpdate+1);
assert.equal(Object.hasOwn(assessmentUpdateArgs.at(-1),'startsOn'),false,'Exact-time edit must not clear database-derived start date');
assert.equal(Object.hasOwn(assessmentUpdateArgs.at(-1),'endsOn'),false,'Exact-time edit must not clear database-derived stop date');
assert.equal(withEnd.assessment.startsAt.toISOString(),'2030-02-01T02:00:00.000Z');
assert.equal(withEnd.assessment.endsAt.toISOString(),'2030-03-01T15:59:00.000Z');
assert.equal(withEnd.assessment.schedulePaused,true,'Editing schedule must not activate it');
exactRow.endsOn='2030-03-01'; // same derived state as PostgreSQL
lastUpdate=assessmentUpdateArgs.length;
const shiftedEnd=await api.manageSchoolAssessment({
 start_year:2030,period:'BoSY',assessment_action:'schedule',
 schedule_enabled:true,starts_at:'2030-02-01T02:00:00.000Z',
 ends_at:'2030-03-05T15:59:00.000Z',expected_revision:exactRow.revision
},coordinator);
assert.equal(assessmentUpdateArgs.length,lastUpdate+1);
assert.equal(Object.hasOwn(assessmentUpdateArgs.at(-1),'startsOn'),false);
assert.equal(Object.hasOwn(assessmentUpdateArgs.at(-1),'endsOn'),false);
assert.equal(shiftedEnd.assessment.endsAt.toISOString(),'2030-03-05T15:59:00.000Z');
const backToOpen=await api.manageSchoolAssessment({
 start_year:2030,period:'BoSY',assessment_action:'schedule',
 schedule_enabled:true,starts_at:'2030-02-01T02:00:00.000Z',
 ends_at:null,expected_revision:exactRow.revision
},coordinator);
assert.equal(backToOpen.assessment.endsAt,null,'Removing stop date keeps saved start');
assert.equal(Object.hasOwn(assessmentUpdateArgs.at(-1),'startsOn'),false);
assert.equal(Object.hasOwn(assessmentUpdateArgs.at(-1),'endsOn'),false);
assert.equal(backToOpen.assessment.startsAt.toISOString(),'2030-02-01T02:00:00.000Z');
// Today's schedule can be saved without activation; Go live is an independent action.
const today=schedule.manilaDay(),year=Number(today.slice(0,4));
await save('EoSY',today,today,0,year);
let current=rows.find(r=>r.startYear===year&&r.period==='EoSY');
assert.equal(current.isLive,false);
assert.equal(current.schedulePaused,true);
await api.manageSchoolAssessment({start_year:year,period:'EoSY',assessment_action:'activate',is_live:true,expected_revision:current.revision},coordinator);
assert.equal(live(current),true);
await api.manageSchoolAssessment({start_year:year,period:'EoSY',assessment_action:'activate',is_live:false,expected_revision:current.revision},coordinator);
assert.equal(current.schedulePaused,true);
assert.equal(live(current),false);
await api.manageSchoolAssessment({start_year:year,period:'EoSY',assessment_action:'activate',is_live:true,expected_revision:current.revision},coordinator);
assert.equal(live(current),true);
const cleared=await api.manageSchoolAssessment({start_year:year,period:'EoSY',assessment_action:'schedule',schedule_enabled:false,expected_revision:current.revision},coordinator);
assert.equal(current.isLive,true,'Clear preserves a running assessment');
assert.equal(cleared.assessment.isLive,true);
assert.equal(cleared.assessment.startsOn,null);
assert.equal(current.scheduleEnabled,false);
await assert.rejects(()=>api.manageSchoolAssessment({start_year:year,period:'MoSY',assessment_action:'activate',is_live:true,expected_revision:0},coordinator),/Set and save/);
await api.manageSchoolAssessment({start_year:year,period:'EoSY',assessment_action:'activate',is_live:false,expected_revision:current.revision},coordinator);
await save('MoSY',today,today,0,year);
const goLive=rows.find(r=>r.startYear===year&&r.period==='MoSY');
assert.ok(goLive.startsAt instanceof Date);
await api.manageSchoolAssessment({start_year:year,period:'MoSY',assessment_action:'activate',is_live:true,expected_revision:goLive.revision},coordinator);
assert.equal(goLive.isLive,true);
await assert.rejects(()=>save('BoSY',today,today,0,year),error=>error.status===409&&/overlap/.test(error.message));
await api.manageSchoolAssessment({start_year:year,period:'MoSY',assessment_action:'activate',is_live:false,expected_revision:rows.find(r=>r.startYear===year&&r.period==='MoSY').revision},coordinator);
await api.manageSchoolAssessment({start_year:year,period:'MoSY',assessment_action:'schedule',schedule_enabled:false,expected_revision:rows.find(r=>r.startYear===year&&r.period==='MoSY').revision},coordinator);
assert.equal(live({...row,isLive:false},Date.parse('2027-07-01')),false);assert.equal(status({...row,isLive:false},Date.parse('2027-07-01')),'Waiting');
await assert.rejects(()=>api.manageSchoolAssessment({start_year:2027,period:'EoSY',assessment_action:'schedule',schedule_enabled:false,expected_revision:0},{...coordinator,role:'teacher'}),e=>e.status===403);
const timed={isLive:true,scheduleEnabled:true,startsAt:'2027-11-08T01:30:00Z',endsAt:'2027-11-08T08:45:00Z'};
assert.equal(live(timed,Date.parse('2027-11-08T01:29:59Z')),false);assert.equal(live(timed,Date.parse(timed.startsAt)),true);assert.equal(live(timed,Date.parse(timed.endsAt)),false);assert.equal(schedule.scheduleInstant('2027-11-08','13:30'),'2027-11-08T05:30:00.000Z');assert.equal(schedule.localDateTime(timed.startsAt).time,'09:30');assert.equal(schedule.windowsOverlap(timed,{startsAt:timed.endsAt,endsAt:null}),false);assert.equal(schedule.calendarConflict({...timed,period:'BoSY'},[{period:'MoSY',startsAt:timed.endsAt,endsAt:'2027-11-08T09:00:00Z'}],2027).reason,'overlap','Same-day periods are reserved even when instants are adjacent');
const stop=new Date(Date.now()+3600000).toISOString();
const draft=await api.manageSchoolAssessment({start_year:year,period:'BoSY',assessment_action:'schedule',schedule_enabled:true,starts_at:null,ends_at:stop,expected_revision:0},coordinator);
assert.equal(draft.assessment.isLive,false,'Stop-only legacy schedules must still require Go live');
assert.equal(draft.assessment.schedulePaused,true);
assert.ok(Math.abs(+draft.assessment.startsAt-Date.now())<2000);
assert.equal(draft.assessment.endsAt.toISOString(),stop);
await api.manageSchoolAssessment({start_year:year,period:'BoSY',assessment_action:'activate',is_live:true,expected_revision:draft.assessment.revision},coordinator);
assert.equal(rows.find(r=>r.startYear===year&&r.period==='BoSY').isLive,true);
await assert.rejects(()=>api.manageSchoolAssessment({start_year:year,period:'BoSY',assessment_action:'schedule',schedule_enabled:true,starts_at:stop,ends_at:new Date(Date.now()).toISOString(),expected_revision:rows.find(r=>r.startYear===year&&r.period==='BoSY').revision},coordinator),/after/);
await api.manageSchoolAssessment({start_year:year,period:'BoSY',assessment_action:'activate',is_live:false,expected_revision:rows.find(r=>r.startYear===year&&r.period==='BoSY').revision},coordinator);
await assert.rejects(()=>save('EoSY','2026-12-31','2027-01-01',0,2027),/within SY/);
await assert.rejects(()=>save('EoSY','2028-12-31','2029-01-01',0,2027),/within SY/);
assert.equal(schedule.schoolYearIssue('2026-12-31T16:00:00Z','2028-12-31T16:00:00Z',2027,true),'','UTC boundaries follow Philippine calendar years');
assert.equal(schedule.calendarConflict({period:'MoSY',startsAt:'2027-05-01T00:00:00Z',endsAt:'2027-05-02T00:00:00Z'},[{period:'BoSY',startsAt:'2027-06-01T00:00:00Z',endsAt:'2027-08-31T00:00:00Z'}],2027).reason,'order');
assert.equal(schedule.calendarConflict({period:'MoSY',startsAt:'2027-09-01T00:00:00Z',endsAt:'2027-10-01T00:00:00Z'},[{period:'BoSY',startsAt:'2027-06-01T00:00:00Z',endsAt:'2027-08-31T00:00:00Z'}],2027),null);
assert.equal(schedule.scheduleIsLive({startYear:2027,isLive:true,scheduleEnabled:false},Date.parse('2026-11-07')),true);
assert.equal(schedule.authorityExpiry({startYear:2027,scheduleEnabled:true},Date.parse('2028-12-31T15:59:00Z')),'2028-12-31T16:00:00.000Z');
assert.equal(schedule.authorityExpiry({startYear:2024,scheduleEnabled:false},Date.parse('2026-11-07T00:00:00Z')),'2026-11-08T00:00:00.000Z','Manual past-year authority retains a valid lease');assert.equal(schedule.scheduleStatus({startYear:2027,isLive:false},Date.parse('2026-11-07')),'Not live');assert.equal(schedule.scheduleStatus({startYear:2027,isLive:true},Date.parse('2026-11-07')),'Live');
// A Philippine date floor applies to newly chosen starts, never stored history.
const midnight=Date.parse('2026-11-06T16:00:00Z');
assert.ok(schedule.startDateIssue('2026-11-06T15:59:59Z',null,midnight));
assert.equal(schedule.startDateIssue('2026-11-06T16:00:00Z',null,midnight),'');
assert.equal(schedule.startDateIssue('2026-11-06T15:59:59Z','2026-11-06T15:59:59Z',midnight),'');
assert.ok(schedule.startDateIssue('2026-11-06T15:58:59Z','2026-11-06T15:59:59Z',midnight));
const past=new Date(Date.now()-86400000).toISOString();
await assert.rejects(()=>api.manageSchoolAssessment({start_year:year,period:'EoSY',assessment_action:'schedule',schedule_enabled:true,starts_at:past,ends_at:stop,expected_revision:rows.find(r=>r.startYear===year&&r.period==='EoSY').revision},coordinator),/on or after today/);
const historical=rows.find(r=>r.startYear===year&&r.period==='EoSY');historical.startsAt=new Date(past);historical.scheduleEnabled=true;historical.isLive=false;historical.schedulePaused=true;
rows=rows.filter(r=>r===historical);await api.manageSchoolAssessment({start_year:year,period:'EoSY',assessment_action:'schedule',schedule_enabled:true,starts_at:past,ends_at:stop,expected_revision:historical.revision},coordinator);assert.equal(rows[0].startsAt.toISOString(),past);
// A cleared/inactive historic manual start must not appear as a current schedule.
const coordinatorUI=fs.readFileSync('components/SchoolAssessmentActivation.jsx','utf8');
assert.ok(coordinatorUI.includes("localDateTime(row?.scheduleEnabled?row.startsAt:null)"),'Only enabled schedules may prefill a saved start');
assert.ok(coordinatorUI.includes("row?.scheduleEnabled&&dayInSchoolYear(row?.startsOn,year)"),'An unscheduled legacy date must not override the current-day default');
assert.ok(coordinatorUI.includes("row?.scheduleEnabled&&dayInSchoolYear(row?.endsOn,year)"),'An inactive legacy end must not be prefilled');
assert.ok(coordinatorUI.includes("formatScheduleInstant(row?.scheduleEnabled||live?row?.startsAt:null)||'Not set'"),'Inactive unscheduled cards must show Not set');
assert.ok(coordinatorUI.includes("formatScheduleInstant(row?.scheduleEnabled||live?row?.endsAt:null)||'Not set'"),'Inactive unscheduled cards must not display an old end');
assert.ok(coordinatorUI.includes("localDateTime(new Date(openedAt).toISOString()).time"),'New schedule defaults must use the time at dialog opening');
const previousManualStart=new Date('2026-11-09T03:37:41.990Z');
const stopped={scheduleEnabled:false,isLive:false,startsAt:previousManualStart};
assert.equal(schedule.scheduleIsLive(stopped),false);
assert.equal(schedule.localDateTime(stopped.scheduleEnabled?stopped.startsAt:null).day,'','Historical inactive date is ignored by schedule form');
assert.equal(schedule.localDateTime(new Date().toISOString()).day,schedule.manilaDay(),'Current defaults use Philippine time');
console.log('PASS Philippine midnight/inclusive end, leap dates, overlap and adjacency, schedule-clamped offline lease, effective live query, stale edits, atomic overlap rejection, schedule-first activation, future arming, start-only saves, stop-date edits without clearing trigger-managed dates, and scheduled pause/resume.');
})().catch(e=>{console.error(e);process.exitCode=1;});
