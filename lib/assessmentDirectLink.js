"use client";
import {startTeacherAssessmentPairing,acceptLearnerAssessmentOffer,completeTeacherAssessmentPairing,getAssessmentPeerStatus,subscribeAssessmentPeerStatus} from './assessmentPeer';
import {publishAssessmentPairingOffer,publishAssessmentPairingAnswer,subscribeAssessmentPairingOffer,subscribeAssessmentPairingAnswer} from './assessmentChannel';

// Use the existing assessment-scoped reliable data channel automatically after
// an online join. It changes transport only: enrollment, claiming the code and
// saving/scoring remain on the authenticated API. Existing/manual links win.
export function startAssessmentDirectLink({code,role,onConnected},transport={
 startTeacherAssessmentPairing,acceptLearnerAssessmentOffer,completeTeacherAssessmentPairing,getAssessmentPeerStatus,subscribeAssessmentPeerStatus,
 publishAssessmentPairingOffer,publishAssessmentPairingAnswer,subscribeAssessmentPairingOffer,subscribeAssessmentPairingAnswer,
}){
 if(!/^[A-Z0-9]{6}$/.test(code)||!['teacher','learner'].includes(role))return()=>{};
 let stopped=false,pending=false,offer='',answer='',answeredOffer='',connected=false;
 const status=transport.subscribeAssessmentPeerStatus(code,value=>{if(stopped)return;if(value.connected&&!connected){connected=true;onConnected?.();}else if(!value.connected)connected=false;});
 const subscription=role==='teacher'
  ?transport.subscribeAssessmentPairingAnswer(code,async packet=>{if(stopped||pending||(transport.getAssessmentPeerStatus(code).connected||transport.getAssessmentPeerStatus(code).established))return;pending=true;try{await transport.completeTeacherAssessmentPairing(code,packet);}catch{/* A stale/different invitation can never replace an established link. */}finally{pending=false;}})
  :transport.subscribeAssessmentPairingOffer(code,async packet=>{if(stopped||pending||(transport.getAssessmentPeerStatus(code).connected||transport.getAssessmentPeerStatus(code).established))return;pending=true;try{
    if(packet!==answeredOffer){const result=await transport.acceptLearnerAssessmentOffer(packet,code);if(stopped)return;answer=result.answer;answeredOffer=packet;}
    if(!stopped&&answer)await transport.publishAssessmentPairingAnswer(code,answer);
   }catch{/* RTC unavailable or isolated networks retain the cloud path. */}finally{pending=false;}});
 const tick=async()=>{if(stopped||pending)return;const current=transport.getAssessmentPeerStatus(code);if(current.connected||current.established)return;pending=true;try{
   if(role==='teacher'){offer ||= await transport.startTeacherAssessmentPairing(code);if(!stopped)await transport.publishAssessmentPairingOffer(code,offer);}
   else if(answer)await transport.publishAssessmentPairingAnswer(code,answer);
  }catch{/* No manual pairing dialog or failure state for an optional fast path. */}finally{pending=false;}};
 void subscription.ready.then(()=>{if(!stopped)void tick();}).catch(()=>{});
 const interval=setInterval(()=>void tick(),1000);
 // Retain the data channel through transient re-renders/tab changes. The
 // existing session lifecycle owns ending, recovery and device handoff.
 return()=>{stopped=true;clearInterval(interval);status?.();subscription.unsubscribe();};
}
