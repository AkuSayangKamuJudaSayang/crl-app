"use client";

import { useEffect, useState } from "react";
import { getTeacherSnapshot, localUserKey, readLocalQueue, saveTeacherSnapshot, syncTeacherQueue, isProbablyOnline } from "../lib/localFirstStore";

export default function LocalFirstStatus({ user, learners, assessments, send }) {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");

  const key = user ? localUserKey(user) : "";

  async function refresh() {
    if (!key) return;
    const queue = await readLocalQueue(key);
    setPending(queue.length);
    const result = await isProbablyOnline(1600);
    setOnline(Boolean(result?.ok));
  }

  useEffect(() => {
    if (!user) return;
    void saveTeacherSnapshot(user, learners, assessments);
    void refresh();
    const onOnline = () => void refresh();
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    const timer = window.setInterval(refresh, 10000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.clearInterval(timer);
    };
  }, [user, learners, assessments]);

  async function syncNow() {
    if (!key || syncing) return;
    setSyncing(true);
    setMessage("");
    const health = await isProbablyOnline(2200);
    if (!health?.ok || (health.latencyMs != null && health.latencyMs > 2500)) {
      setOnline(false);
      setMessage("Connection is not ready for synchronization.");
      setSyncing(false);
      return;
    }
    setOnline(true);
    const result = await syncTeacherQueue({ userKey: key, send });
    setPending(result.pending);
    setMessage(result.pending ? "Some changes are still pending." : (result.synced ? "Local changes synchronized." : "Everything is already synchronized."));
    setSyncing(false);
  }

  if (!user) return null;

  return (
    <div style={{ position: "fixed", left: 16, bottom: 16, zIndex: 9999, display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 999, background: "rgba(255,255,255,.94)", border: "1px solid #d9e7f4", boxShadow: "0 10px 26px rgba(22,56,95,.12)", fontSize: 10, color: "#5f7892", backdropFilter: "blur(10px)" }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: online ? "#18a05e" : "#c77b17" }} />
      <strong>{online ? "Online" : "Offline"}</strong>
      {pending > 0 ? <span>{pending} pending</span> : <span>Saved locally</span>}
      <button type="button" onClick={syncNow} disabled={syncing} style={{ border: 0, borderRadius: 999, padding: "5px 9px", background: "#1559a6", color: "#fff", fontWeight: 800, cursor: syncing ? "wait" : "pointer" }}>{syncing ? "Syncing…" : "Sync"}</button>
      {message ? <span aria-live="polite">{message}</span> : null}
    </div>
  );
}
