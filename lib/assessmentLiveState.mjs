// A database read started before a live command may finish after it. Briefly
// protect the exact live item/clock while its authoritative write catches up.
// Forward progress and terminal server replies always remain authoritative.
export const LIVE_SNAPSHOT_GRACE_MS=8000;
export function deferConflictingServerSnapshot(incoming,current,sinceLive,movesForward){
 if(!current||movesForward||sinceLive<0||sinceLive>=LIVE_SNAPSHOT_GRACE_MS)return false;
 if(incoming.ended||['completed','ended','terminated','teacher_review'].includes(incoming.stage))return false;
 const fields=[['stage'],['current_content','currentContent'],['item_index','itemIndex'],['passage_started_at','passageStartedAt'],['passage_paused_at','passagePausedAt']];
 for(const aliases of fields){const present=aliases.find(key=>Object.hasOwn(incoming,key));if(!present)continue;const previous=aliases.map(key=>current[key]).find(value=>value!==undefined);if(previous===undefined)continue;if(String(incoming[present]??'')!==String(previous??''))return true;}
 return false;
}
