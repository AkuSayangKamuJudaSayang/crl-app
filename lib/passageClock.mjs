// The visible reading clock uses milliseconds. Persisted whole-second values
// must never overwrite a newer pause/resume command.
export function passageClockFields(clock){
 const started=clock.startedAtMs?new Date(clock.startedAtMs).toISOString():null;
 const paused=clock.paused&&clock.pausedAtMs?new Date(clock.pausedAtMs).toISOString():null;
 const seconds=clock.pausedAccumulatedMs/1000;
 return {passage_started_at:started,passageStartedAt:started,passage_paused_at:paused,passagePausedAt:paused,passage_paused_seconds:seconds,passagePausedSeconds:seconds};
}
export function applyPassageClockCommand(clock,mode,now=Date.now()){
 if(!['pause','resume'].includes(mode))return false;
 const pause=mode==='pause';if(!clock.startedAtMs||pause===clock.paused)return false;
 if(pause){clock.frozenSeconds=Math.min(120,Math.max(0,Math.floor((now-clock.startedAtMs-clock.pausedAccumulatedMs)/1000)));clock.paused=true;clock.pausedAtMs=now;}
 else{clock.pausedAccumulatedMs+=clock.pausedAtMs?Math.max(0,now-clock.pausedAtMs):0;clock.pausedAtMs=null;clock.paused=false;}
 return true;
}
