// Philippine scheduling uses exact instants; date-only legacy ranges remain readable.
export const ASSESSMENT_TIME_ZONE='Asia/Manila';
const dayFormat=new Intl.DateTimeFormat('en-CA',{timeZone:ASSESSMENT_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'});
export function manilaDay(now=Date.now()){return dayFormat.format(new Date(now));}
export function dateOnly(value){if(!value)return '';const s=value instanceof Date?value.toISOString().slice(0,10):String(value).slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return '';const d=new Date(s+'T00:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===s?s:'';}
export function scheduleEndBoundary(day){return Date.parse(dateOnly(day)+'T00:00:00+08:00')+86400000;}
export function timestamp(value){const n=value instanceof Date?+value:value?Date.parse(value):NaN;return Number.isFinite(n)?n:null;}
export function scheduleBounds(row){return {start:timestamp(row?.startsAt)??(dateOnly(row?.startsOn)?Date.parse(dateOnly(row.startsOn)+'T00:00:00+08:00'):null),end:timestamp(row?.endsAt)??(dateOnly(row?.endsOn)?scheduleEndBoundary(row.endsOn):null)};}
export function localDateTime(value){const n=timestamp(value);if(n===null)return {day:'',time:''};const iso=new Date(n+8*3600000).toISOString();return {day:iso.slice(0,10),time:iso.slice(11,16)};}
export function scheduleInstant(day,time){return dateOnly(day)===day&&/^([01]\d|2[0-3]):[0-5]\d$/.test(time)?new Date(day+'T'+time+':00+08:00').toISOString():null;}
export function scheduleIssue(start,end){if(!dateOnly(start)||!dateOnly(end))return 'Choose a valid start date and end date.';return start>end?'The end date must be on or after the start date.':'';}
export function instantIssue(start,end){if(timestamp(start)===null)return 'Choose a valid start date and time.';if(end&&timestamp(end)===null)return 'Choose a valid stop date and time.';return end&&timestamp(end)<=timestamp(start)?'The stop must be after the start date and time.':'';}
export function rangesOverlap(a,b,c,d){return Boolean(a&&b&&c&&d&&a<=d&&c<=b);}
export function windowsOverlap(a,b){const x=scheduleBounds(a),y=scheduleBounds(b);return x.start!==null&&y.start!==null&&x.start<(y.end??Infinity)&&y.start<(x.end??Infinity);}
export const SINGLE_LIVE_NOTICE='Only one timeline can be live at a time. Pause the live timeline first.';
export function scheduledWindowOpen(row,now=Date.now()){const {start,end}=scheduleBounds(row);return start!==null&&!row?.schedulePaused&&now>=start&&(end===null||now<end);}
export function scheduleIsLive(row,now=Date.now()){return Boolean(row?.isLive&&(!row.scheduleEnabled||scheduledWindowOpen(row,now)));}
export function liveScheduleWhere(now=Date.now()){return {isLive:true,OR:[{scheduleEnabled:false},{scheduleEnabled:true,schedulePaused:false,startsAt:{lte:new Date(now)},OR:[{endsAt:null},{endsAt:{gt:new Date(now)}}]}]};}
export function scheduleStatus(row,now=Date.now()){if(!row?.scheduleEnabled)return row?.isLive?'Live':'Not live';const {start,end}=scheduleBounds(row);if(start!==null&&now<start)return 'Scheduled';if(end!==null&&now>=end)return 'Ended';return row.schedulePaused?'Paused':row.isLive?'Live':'Waiting';}
export function authorityExpiry(row,now=Date.now()){const {end}=scheduleBounds(row);return new Date(Math.min(Number(now)+86400000,row?.scheduleEnabled&&end!==null?end:Infinity)).toISOString();}
export function formatScheduleDate(day){const value=dateOnly(day);return value?new Intl.DateTimeFormat('en-PH',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(value+'T00:00:00Z')):'';}
export function formatScheduleInstant(value){return timestamp(value)===null?'':new Intl.DateTimeFormat('en-PH',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',hour12:true,timeZone:ASSESSMENT_TIME_ZONE}).format(new Date(value));}
