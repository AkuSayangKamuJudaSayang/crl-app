"use client";

import { useEffect, useState } from "react";
import LocalAssessmentPairing from "./LocalAssessmentPairing";
import { disconnectAssessmentPeer, findLinkedAssessmentPeerSession, getTeacherDevicePairingCode, subscribeAssessmentLink } from "../lib/assessmentPeer";

export default function TeacherOfflineSettings({ offline }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  useEffect(() => {
    const follow = () => {
      const linked = findLinkedAssessmentPeerSession("teacher");
      if (linked) setCode(linked.code);
    };
    follow();
    return subscribeAssessmentLink(follow);
  }, []);
  const prepare = () => { setCode(getTeacherDevicePairingCode()); setOpen(true); };
  return <section className="crl-roster-offline" aria-label="Offline mode settings">
    <style>{`.crl-roster-offline{margin:0 0 16px;min-width:0}.crl-roster-offline>button{min-height:42px;padding:9px 14px;border:1px solid #ccd5df;border-radius:9px;background:transparent;color:inherit;font:700 13px Arial,sans-serif;cursor:pointer}.crl-roster-offline>button:disabled{opacity:.55;cursor:not-allowed}.crl-roster-offline p{margin:8px 0;font:13px/1.5 Arial,sans-serif}.crl-roster-offline .local-pair-section{margin-top:10px}`}</style>
    <button type="button" disabled={!offline} aria-expanded={open && offline} onClick={() => open ? setOpen(false) : prepare()}>Offline settings</button>
    {offline ? <p>Connect the learner device once for this sitting.</p> : null}
    {offline && open && code ? <>
      <LocalAssessmentPairing code={code} role="teacher" offline deviceOnly />
      <button type="button" onClick={() => {
        disconnectAssessmentPeer(code);
        setCode(getTeacherDevicePairingCode());
      }}>Pair a different device</button>
    </> : null}
  </section>;
}
