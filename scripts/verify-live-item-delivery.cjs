const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
(async()=>{
 const {learnerSessionContent}=await import('../lib/storyComprehension.mjs');
 const channels=[],packets=[],peerPackets=[];
 const client={channel(topic){const channel={state:'joining',topic,on(){return this;},subscribe(callback){this.callback=callback;return this;},async httpSend(event,payload,options){packets.push({transport:'http',event,payload,options});return{success:true};},async send(packet,options){packets.push({transport:'socket',...packet,options});return'ok';},unsubscribe(){this.state='closed';}};channels.push(channel);return channel;}};
 const ctx=vm.createContext({window:{},process:{env:{}},console,setTimeout,clearTimeout,Date,Promise,Map,Set,createClient:()=>client,checkpointTeacherSession(){},learnerSessionContent,publishAssessmentPeerState:(code,session)=>{peerPackets.push({code,session});return true;},publishAssessmentPeerControl(){},publishAssessmentPeerPresence(){},subscribeAssessmentPeerMessages(){}});
 const source=fs.readFileSync('lib/assessmentChannel.js','utf8').replace(/^import[\s\S]*?from ["'][^"']+["'];\s*/gm,'').replace(/^export /gm,'');vm.runInContext(source,ctx);
 const first={code:'QA1234',stage:'letter',current_content:'B',item_index:1,updated_at:'2026-01-01'};
 // Subscription deliberately remains unresolved. The first correct/incorrect
 // item update must use REST immediately rather than wait for its 10s join.
 const published=await Promise.race([ctx.publishAssessmentRealtimeState('QA1234',first),new Promise((_,reject)=>setTimeout(()=>reject(Error('First item blocked behind subscription')),100))]);
 assert.equal(published,true);assert.equal(packets[0].transport,'http');assert.equal(packets[0].payload.session.current_content,'B');assert.equal(packets[0].options.timeout,1500);
 channels[0].state='joined';channels[0].callback('SUBSCRIBED');
 await ctx.publishAssessmentRealtimeState('QA1234',{...first,current_content:'C',item_index:2});assert.equal(channels.length,1,'Shared channel is not replaced by each mark');assert.equal(packets[1].transport,'socket');assert.equal(packets[1].payload.session.item_index,2);
 ctx.publishAssessmentState(null,{source:'teacher',session:first});assert.equal(peerPackets[0].session.current_content,'B','Direct/offline transport still receives the immediate item');
 const route=fs.readFileSync('app/api/assessment/route.js','utf8');let calls=0;const identity=vm.createContext({WeakMap,getCurrentTeacher:async()=>{calls++;return{schoolId:'123456',version:calls};}}),a=route.indexOf('const assessmentIdentityRequests'),b=route.indexOf('async function requireTeacher',a);vm.runInContext(route.slice(a,b),identity);
 const request={};await Promise.all([identity.getAuthenticatedUser(request),identity.getAuthenticatedUser(request)]);assert.equal(calls,1);await identity.getAuthenticatedUser({});assert.equal(calls,2,'New requests revalidate account/session revocation');assert.ok(route.includes('try{const user=await getAuthenticatedUser(request);return user?await withSchoolScope'));
 const learner=fs.readFileSync('app/learner/LearnerAssessmentPage.jsx','utf8'),liveBranch=learner.slice(learner.indexOf('      <style jsx global>{`',learner.indexOf('<LearnerToolbar')));
 assert.ok(liveBranch.includes('@font-face { font-family: "Comic Neue"'));assert.ok(liveBranch.includes('.letter, .word, .story-card-title, .passage-title, .passage, .question { font-family: "Comic Neue"'));
 const wrapper=fs.readFileSync('app/components/OfflineRuntime.jsx','utf8');assert.ok(wrapper.indexOf('new URL(inputUrl, window.location.origin).origin')<wrapper.indexOf('const tokenSession = await getOfflineTeacherSession()',wrapper.indexOf('const wrappedFetch')));
 console.log('PASS cold first-item HTTP delivery without socket-join delay, warm socket and immediate offline peer updates, request-local identity validation and joined learner webfont lifecycle');
})().catch(e=>{console.error(e);process.exitCode=1;});
