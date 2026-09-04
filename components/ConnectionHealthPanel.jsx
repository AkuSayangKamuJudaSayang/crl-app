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

export default function ConnectionHealthPanel({ role = "learner" }) {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState(getConnectionInfo);
  const [probe, setProbe] = useState(null);
  const [checking, setChecking] = useState(false);
  const [hotspotOpen, setHotspotOpen] = useState(false);

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

  const quality = useMemo(() => {
    const latency = probe?.latencyMs ?? info.rtt;
    if (info.online === false) return "Offline";
    if (latency == null) return "Checking";
    if (latency < 120) return "Excellent";
    if (latency < 250) return "Good";
    if (latency < 450) return "Fair";
    return "Slow";
  }, [info, probe]);

  async function runProbe() {
    setChecking(true);
    setProbe(await isProbablyOnline(2200));
    setChecking(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Open connection status"
        title="Connection status"
        style={{
          position: "fixed", right: 18, bottom: 18, zIndex: 10000,
          width: 48, height: 48, borderRadius: 16,
          border: "1px solid rgba(255,255,255,.6)",
          background: "linear-gradient(135deg,#0e5db7,#1d77d6)",
          color: "#fff", boxShadow: "0 14px 35px rgba(7,49,101,.26)",
          cursor: "pointer", fontSize: 20, fontWeight: 900,
        }}
      >
        {info.online === false ? "×" : "⌁"}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Connection status"
          style={{
            position: "fixed", right: 18, bottom: 76, zIndex: 10000,
            width: "min(320px, calc(100vw - 32px))", borderRadius: 20, padding: 18,
            background: "rgba(255,255,255,.97)", border: "1px solid #d8e6f4",
            boxShadow: "0 22px 60px rgba(16,57,104,.22)", color: "#16385f", backdropFilter: "blur(16px)",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 900, color: "#6d84a0", textTransform: "uppercase", letterSpacing: ".12em" }}>
            Connection Status
          </div>
          <div style={{ marginTop: 5, fontSize: 20, fontWeight: 900, color: "#0c3f80" }}>
            {quality}
          </div>
          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div style={cellStyle}><span style={cellLabel}>Network</span><strong>{info.type === "unknown" ? "Unavailable" : info.type}</strong></div>
            <div style={cellStyle}><span style={cellLabel}>Server RTT</span><strong>{probe?.latencyMs != null ? `${probe.latencyMs} ms` : "—"}</strong></div>
            <div style={cellStyle}><span style={cellLabel}>Browser RTT</span><strong>{info.rtt != null ? `${info.rtt} ms` : "—"}</strong></div>
            <div style={cellStyle}><span style={cellLabel}>Effective</span><strong>{info.effectiveType}</strong></div>
          </div>
          <div style={{ marginTop: 12, fontSize: 10, lineHeight: 1.5, color: "#7890a8" }}>
            {role === "teacher" ? "Tip: a laptop hotspot can provide a direct Wi‑Fi classroom network." : "Wi‑Fi/hotspot connection detected when the browser reports Wi‑Fi."} The browser does not expose the Wi‑Fi SSID, so the exact hotspot name cannot be read reliably.
          </div>
          {role === "teacher" && (
            <button
              type="button"
              onClick={openHotspotSettings}
              style={{ width: "100%", marginTop: 10, minHeight: 40, border: "1px solid #b9d3ec", borderRadius: 12, background: "#eef6ff", color: "#1559a6", fontWeight: 900, cursor: "pointer" }}
            >
              Enable laptop hotspot
            </button>
          )}

          <button
            type="button"
            onClick={runProbe}
            disabled={checking}
            style={{ width: "100%", marginTop: 12, minHeight: 40, border: 0, borderRadius: 12, background: "#1559a6", color: "#fff", fontWeight: 900, cursor: checking ? "wait" : "pointer", opacity: checking ? .7 : 1 }}
          >
            {checking ? "Checking…" : "Test connection"}
          </button>
        </div>
      )}

      {hotspotOpen && role === "teacher" && (
        <div
          role="dialog"
          aria-modal="true"
          style={{ position: "fixed", inset: 0, zIndex: 10001, display: "grid", placeItems: "center", padding: 18, background: "rgba(7,31,58,.42)" }}
          onMouseDown={() => setHotspotOpen(false)}
        >
          <div
            onMouseDown={(event) => event.stopPropagation()}
            style={{ width: "min(420px, 100%)", borderRadius: 22, padding: 22, background: "#fff", boxShadow: "0 30px 80px rgba(7,31,58,.25)" }}
          >
            <div style={{ fontSize: 12, fontWeight: 900, color: "#6d84a0", textTransform: "uppercase", letterSpacing: ".12em" }}>Classroom hotspot</div>
            <h2 style={{ margin: "7px 0 8px", color: "#0c3f80", fontSize: 24 }}>Connect the learner device</h2>
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: "#637a92" }}>Turn on Windows Mobile Hotspot, then connect the learner phone to the hotspot Wi‑Fi. Keep both devices nearby for the best local wireless link.</p>
            <div style={{ marginTop: 14, padding: 12, borderRadius: 14, background: "#f3f8fd", color: "#47627e", fontSize: 11, lineHeight: 1.6 }}>The browser can confirm Wi‑Fi and measure connection quality, but it cannot read the hotspot SSID by itself.</div>
            <div style={{ display: "flex", gap: 9, marginTop: 15 }}>
              <button type="button" onClick={openHotspotSettings} style={{ flex: 1, minHeight: 42, border: 0, borderRadius: 12, background: "#1559a6", color: "#fff", fontWeight: 900 }}>Open hotspot settings</button>
              <button type="button" onClick={() => setHotspotOpen(false)} style={{ minHeight: 42, padding: "0 14px", border: "1px solid #cdddec", borderRadius: 12, background: "#fff", color: "#4f6680", fontWeight: 800 }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const cellStyle = { padding: "9px 10px", borderRadius: 12, background: "#f3f8fd", border: "1px solid #dfebf6", display: "grid", gap: 3 };
const cellLabel = { fontSize: 9, color: "#7c91a7", textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 800 };
