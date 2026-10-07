"use client";

import { useEffect, useRef, useState } from "react";

export default function OfflineModeButton({ onReady, onCheckingChange, active = false, disabled = false }) {
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const enable = async () => {
    if (busy.current) return;
    busy.current = true;
    setChecking(true);
    onCheckingChange?.(true);
    setError("");
    try { if (mounted.current) await onReady?.(); }
    catch { if (mounted.current) setError("Could not start offline mode. Try again."); }
    finally { busy.current = false; if (mounted.current) { setChecking(false); onCheckingChange?.(false); } }
  };
  return <div className="crl-offline-mode">
    <style>{`.crl-offline-mode{margin:10px 0;min-width:0}.crl-offline-mode button{min-height:44px;width:100%;padding:10px 16px;border:1px solid #cfd8e2;border-radius:11px;background:#1a2b4c;color:white;font:700 14px/1.4 Arial,sans-serif;cursor:pointer}.crl-offline-mode button:disabled{opacity:.6;cursor:wait}.crl-offline-mode button:focus-visible{outline:3px solid #4a6fa5;outline-offset:3px}.crl-offline-mode small{display:block;margin-top:8px;font:12px/1.4 Arial,sans-serif;color:#8a3928}`}</style>
    <button type="button" disabled={checking || disabled} aria-pressed={active} onClick={() => void enable()}>{checking ? "Connecting offline…" : active ? "Offline Mode · Reconnect" : "Offline Mode"}</button>
    {error ? <small role="status">{error}</small> : null}
  </div>;
}
