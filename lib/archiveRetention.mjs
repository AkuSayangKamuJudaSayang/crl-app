export const ARCHIVE_RETENTION_DAYS=30,ARCHIVE_DAY_MS=86400000;
export function deletionArchiveDates(now=Date.now()) { const deletedAt=new Date(now);return {deletedAt,expiresAt:new Date(+deletedAt+30*ARCHIVE_DAY_MS)}; }
export function archiveAvailable(item,now=Date.now()) { return !item?.purgedAt&&(!item?.expiresAt||+new Date(item.expiresAt)>Number(now)); }
export function archiveDaysRemaining(item,now=Date.now()) { return !item?.expiresAt||item.offline_pending?null:Math.min(30,Math.max(0,Math.ceil((+new Date(item.expiresAt)-Number(now))/ARCHIVE_DAY_MS))); }
export function archiveRetentionLabel(item,now=Date.now()) { if(item.offline_pending)return '30 days begin after deletion syncs';const days=archiveDaysRemaining(item,now);return days===null?'Manually archived':days===0?'Expired':`${days} ${days===1?'day':'days'} remaining`; }
