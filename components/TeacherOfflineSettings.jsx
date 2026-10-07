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
  if (!offline) return null;
  return <section className="crl-roster-offline" aria-label="Offline mode settings">
    <style>{`.crl-roster-offline{box-sizing:border-box;padding:13px 16px;margin:0;min-width:0;border-bottom:1px solid var(--crl-line,#edf1f7)}.crl-roster-offline>button{box-sizing:border-box;min-height:44px;max-width:100%;padding:9px 14px;border:1px solid var(--crl-line-strong,#ccd5df);border-radius:9px;background:transparent;color:inherit;font:700 13px/1.4 Arial,sans-serif;cursor:pointer;white-space:normal;text-align:center}.crl-roster-offline>button:focus-visible{outline:2px solid currentColor;outline-offset:3px}.crl-roster-offline p{margin:8px 0 0;font:13px/1.5 Arial,sans-serif}.crl-roster-offline .local-pair-section{margin-top:10px}@media(max-width:760px){.crl-roster-offline>button{width:100%}}`}</style>
    <button type="button" aria-expanded={open} onClick={() => open ? setOpen(false) : prepare()}>Offline Mode Settings</button>
    <p>Connect the learner device once for this sitting.</p>
    {offline && open && code ? <>
      <LocalAssessmentPairing code={code} role="teacher" offline deviceOnly />
      <button type="button" onClick={() => {
        disconnectAssessmentPeer(code);
        setCode(getTeacherDevicePairingCode());
      }}>Pair a different device</button>
    </> : null}
  </section>;
}
