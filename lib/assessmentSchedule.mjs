// Shared date-only policy. Philippine calendar days are inclusive at both ends.
export const ASSESSMENT_TIME_ZONE='Asia/Manila';
const dayFormat=new Intl.DateTimeFormat('en-CA',{timeZone:ASSESSMENT_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'});
export function manilaDay(now=Date.now()){return dayFormat.format(new Date(now));}
export function dateOnly(value){if(!value)return '';const s=value instanceof Date?value.toISOString().slice(0,10):String(value).slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return '';const date=new Date(s+'T00:00:00Z');return Number.isFinite(+date)&&date.toISOString().slice(0,10)===s?s:'';}
export function scheduleEndBoundary(day){return Date.parse(dateOnly(day)+'T00:00:00+08:00')+86400000;}
export function scheduleIssue(start,end,startYear){if(!dateOnly(start)||!dateOnly(end))return 'Choose a valid start date and end date.';if(start>end)return 'The end date must be on or after the start date.';if(start<`${startYear}-01-01`||end>`${Number(startYear)+1}-12-31`)return `Choose dates in ${startYear} or ${Number(startYear)+1} for this school year.`;return '';}
export function rangesOverlap(a,b,c,d){return Boolean(a&&b&&c&&d&&a<=d&&c<=b);}
export const SINGLE_LIVE_NOTICE='Only one timeline can be live at a time. Pause the live timeline first.';
export function scheduledWindowOpen(row,now=Date.now()){const day=manilaDay(now),start=dateOnly(row?.startsOn),end=dateOnly(row?.endsOn);return Boolean(start&&end&&!row?.schedulePaused&&day>=start&&day<=end);}
export function scheduleIsLive(row,now=Date.now()){return Boolean(row?.isLive&&(!row.scheduleEnabled||scheduledWindowOpen(row,now)));}
export function liveScheduleWhere(now=Date.now()){const date=new Date(manilaDay(now)+'T00:00:00Z');return {isLive:true,OR:[{scheduleEnabled:false,isLive:true},{scheduleEnabled:true,schedulePaused:false,startsOn:{lte:date},endsOn:{gte:date}}]};}
export function scheduleStatus(row,now=Date.now()){if(!row?.scheduleEnabled)return row?.isLive?'Live':'Not live';const day=manilaDay(now);if(day<dateOnly(row.startsOn))return 'Scheduled';if(day>dateOnly(row.endsOn))return 'Ended';return row.schedulePaused?'Paused':row.isLive?'Live':'Waiting';}
export function authorityExpiry(row,now=Date.now()){return new Date(Math.min(Number(now)+86400000,row?.scheduleEnabled?scheduleEndBoundary(row.endsOn):Infinity)).toISOString();}
export function formatScheduleDate(day){const value=dateOnly(day);return value?new Intl.DateTimeFormat('en-PH',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(value+'T00:00:00Z')):'';}
