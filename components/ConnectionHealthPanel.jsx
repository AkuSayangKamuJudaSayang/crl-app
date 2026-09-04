"use client";

import { useEffect, useMemo, useState } from "react";
import { isProbablyOnline } from "../lib/localFirstStore";

function getConnectionInfo() {
  if (typeof navigator === "undefined") return {};
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  return {
    online: navigator.onLine !== false,
    type: connection?.type || "unknown",
    effectiveType: connection?.effectiveType || "unknown",
    rtt: Number.isFinite(connection?.rtt) ? connection.rtt : null,
    downlink: Number.isFinite(connection?.downlink) ? connection.downlink : null,
    saveData: Boolean(connection?.saveData),
  };
}

function qualityFor(info, probe) {
  if (info.online === false) return "Offline";
  const latency = probe?.latencyMs ?? info.rtt;
  if (latency == null) return "Checking";
  if (latency < 100) return "Excellent";
  if (latency < 220) return "Good";
  if (latency < 420) return "Fair";
  return "Slow";
}

export default function ConnectionHealthPanel({ role = "learner" }) {
  const [open, setOpen] = useState(false);
  const [hotspotOpen, setHotspotOpen] = useState(false);
  const [info, setInfo] = useState(getConnectionInfo);
  const [probe, setProbe] = useState(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const refresh = () => setInfo(getConnectionInfo());
    refresh();
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    connection?.addEventListener?.("change", refresh);
    const timer = window.setInterval(refresh, 5000);
    return () => {
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
      connection?.removeEventListener?.("change", refresh);
      window.clearInterval(timer);
    };
  }, []);

  const quality = useMemo(() => qualityFor(info, probe), [info, probe]);

  async function runProbe() {
    if (checking) return;
    setChecking(true);
    try { setProbe(await isProbablyOnline(1600)); }
    finally { setChecking(false); }
  }

  function openHotspotSettings() {
    if (typeof window === "undefined") return;
    try {
      window.location.href = "ms-settings:network-mobilehotspot";
      setHotspotOpen(false);
    } catch {
      setHotspotOpen(true);
    }
  }

  const networkLabel = info.type === "wifi" ? "Wi-Fi / hotspot" : info.type === "unknown" ? "Network" : info.type;
  const serverLatency = probe?.latencyMs ?? null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Connection settings"
        title="Connection settings"
        style={{
          position: "fixed", right: 16, bottom: 16, zIndex: 10000,
          width: 52, height: 52, borderRadius: 17,
          border: "1px solid rgba(255,255,255,.6)",
          background: "linear-gradient(145deg,#0e5db7,#176dcc)",
          color: "#fff", boxShadow: "0 15px 38px rgba(7,49,101,.26)",
          cursor: "pointer", fontSize: 21, fontWeight: 900,
        }}
      >
        <span aria-hidden="true">⌁</span>
      </button>

      {open && (
        <div role="dialog" aria-label="Connection settings" style={{
          position: "fixed", right: 16, bottom: 78, zIndex: 10000,
          width: "min(330px, calc(100vw - 32px))", borderRadius: 22, padding: 18,
          background: "rgba(255,255,255,.98)", border: "1px solid #d8e6f4",
          boxShadow: "0 24px 70px rgba(16,57,104,.23)", color: "#16385f", backdropFilter: "blur(18px)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 900, color: "#6d84a0", letterSpacing: ".14em", textTransform: "uppercase" }}>Connection</div>
              <div style={{ marginTop: 5, fontSize: 22, fontWeight: 950, color: "#0c3f80" }}>{quality}</div>
            </div>
            <div style={{ width: 11, height: 11, borderRadius: 50, background: info.online === false ? "#cf3045" : "#159b63", boxShadow: info.online === false ? "0 0 0 5px rgba(207,48,69,.10)" : "0 0 0 5px rgba(21,155,99,.10)" }} />
          </div>

          <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
            <div style={cellStyle}><span style={cellLabel}>Network</span><strong>{networkLabel}</strong></div>
            <div style={cellStyle}><span style={cellLabel}>Server RTT</span><strong>{serverLatency != null ? `${serverLatency} ms` : "—"}</strong></div>
            <div style={cellStyle}><span style={cellLabel}>Browser RTT</span><strong>{info.rtt != null ? `${info.rtt} ms` : "—"}</strong></div>
            <div style={cellStyle}><span style={cellLabel}>Link</span><strong>{info.effectiveType || "unknown"}</strong></div>
          </div>

          <div style={{ marginTop: 12, padding: 11, borderRadius: 14, background: "#f2f7fd", color: "#617890", fontSize: 10, lineHeight: 1.55 }}>
            {info.online === false ? "The device is offline. Local saved assessment data can still be used." : "Wi-Fi/hotspot connectivity is detected from the browser. Browsers do not expose the exact Wi-Fi SSID."}
          </div>

          <button type="button" onClick={runProbe} disabled={checking} style={actionStyle}>
            {checking ? "Testing connection…" : "Test connection"}
          </button>

          {role === "teacher" && (
            <button type="button" onClick={() => setHotspotOpen(true)} style={{ ...actionStyle, marginTop: 8, background: "#eef6ff", color: "#1559a6", border: "1px solid #c9dff3" }}>
              Open hotspot setup
            </button>
          )}
        </div>
      )}

      {hotspotOpen && role === "teacher" && (
        <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, zIndex: 10001, display: "grid", placeItems: "center", padding: 18, background: "rgba(7,31,58,.44)", backdropFilter: "blur(4px)" }} onMouseDown={() => setHotspotOpen(false)}>
          <div onMouseDown={(event) => event.stopPropagation()} style={{ width: "min(430px,100%)", padding: 24, borderRadius: 24, background: "#fff", boxShadow: "0 30px 80px rgba(7,31,58,.28)" }}>
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: ".14em", textTransform: "uppercase", color: "#6d84a0" }}>Classroom hotspot</div>
            <h2 style={{ margin: "7px 0 8px", color: "#0c3f80", fontSize: 25 }}>Connect the learner device</h2>
            <p style={{ margin: 0, color: "#637a92", fontSize: 12, lineHeight: 1.65 }}>Turn on the laptop hotspot and connect the learner phone to its Wi-Fi. Keep both devices nearby.</p>
            <div style={{ marginTop: 14, padding: 12, borderRadius: 14, background: "#f3f8fd", color: "#58708a", fontSize: 10, lineHeight: 1.55 }}>The browser can measure connection quality and latency, but it cannot read the exact hotspot name.</div>
            <div style={{ display: "flex", gap: 9, marginTop: 16 }}>
              <button type="button" onClick={openHotspotSettings} style={{ flex: 1, minHeight: 44, border: 0, borderRadius: 13, background: "linear-gradient(135deg,#0e5db7,#176dcc)", color: "#fff", fontWeight: 900 }}>Open hotspot settings</button>
              <button type="button" onClick={() => setHotspotOpen(false)} style={{ minHeight: 44, padding: "0 15px", border: "1px solid #cfdeeb", borderRadius: 13, background: "#fff", color: "#536a80", fontWeight: 800 }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const cellStyle = { padding: "9px 10px", borderRadius: 13, background: "#f4f8fd", border: "1px solid #dfebf6", display: "grid", gap: 3 };
const cellLabel = { fontSize: 8, color: "#7c91a7", textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 800 };
const actionStyle = { width: "100%", marginTop: 12, minHeight: 42, border: 0, borderRadius: 13, background: "#1559a6", color: "#fff", fontWeight: 900, cursor: "pointer" };
