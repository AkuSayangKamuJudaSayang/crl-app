"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import AssessmentClient from "../app/teacher/assessment/AssessmentClient";
import AssessmentRecoveryDialog from "./AssessmentRecoveryDialog";
import { activateRecoveryOwner, readTeacherRecovery, recoveryEligible, freezeRecoveredSession, resolveTeacherRecovery, mergeRecoverySession } from "../lib/assessmentRecovery.mjs";
import { getOfflineTeacherSession, getOfflineTeacherSnapshot, getOfflineHostSession, saveOfflineHostSession, enqueueOfflineMutation } from "../lib/teacherOfflineDb";
import { getAssessmentState, saveAssessmentState } from "../lib/assessmentOutbox";

export default function TeacherAssessmentRecovery({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [leaving, setLeaving] = useState(false);
  const [checked, setChecked] = useState(false);
  const [candidate, setCandidate] = useState(null);
  const [recovered, setRecovered] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if (leaving && pathname === "/teacher") setLeaving(false); }, [leaving, pathname]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const cached = await getOfflineTeacherSession().catch(() => null);
      let user = null;
      try {
        const response = await fetch("/api/auth?action=verify", { cache: "no-store", credentials: "include", signal: AbortSignal.timeout(6000) });
        const data = await response.json();
        if (response.ok && data.valid) user = data.user;
        else if (response.status === 401 || response.status === 403) return;
      } catch {}
      if (!user && cached?.offlineToken && !cached.signedOut && Number(cached.expiresAt) > Date.now()) user = cached.user;
      if (!user || !["teacher", "admin"].includes(String(user.role).toLowerCase())) return;
      activateRecoveryOwner(user.id);
      const draft = readTeacherRecovery(user.id);
      if (!draft) return;
      const code = draft.session.code;
      let host = await getOfflineHostSession(code);
      const deleted = await getAssessmentState(`deleted-session:${code}`);
      if (deleted?.deleted) { resolveTeacherRecovery(code); return; }
      if (!host) host = draft.session;
      const snapshot = await getOfflineTeacherSnapshot(user.id).catch(() => null);
      const final = await getAssessmentState(`final-review:${code}`).catch(() => null);
      if (!recoveryEligible(draft, { teacherId: user.id, host, tombstones: snapshot?.learnerTombstones, saved: final?.saved })) {
        resolveTeacherRecovery(code); return;
      }
      try {
        const response = await fetch(`/api/assessment?action=host_get&code=${encodeURIComponent(code)}`, { credentials: "include", cache: "no-store", signal: AbortSignal.timeout(6000) });
        const data = await response.json();
        if (response.ok && data.session) {
          host = data.session;
          // A later authoritative controller always wins over an older draft.
          draft.session = mergeRecoverySession(draft.session, host);
        } else if ([403, 404, 410].includes(response.status)) { resolveTeacherRecovery(code); return; }
      } catch {}
      if (!recoveryEligible(draft, { teacherId: user.id, host, tombstones: snapshot?.learnerTombstones, saved: final?.saved })) { resolveTeacherRecovery(code); return; }
      if (!cancelled) setCandidate({ ...draft, session: { ...host, ...draft.session, teacher_id: Number(user.id) }, teacherId: Number(user.id) });
    })().catch(() => {}).finally(() => { if (!cancelled) setChecked(true); });
    return () => { cancelled = true; };
  }, []);

  const recover = async () => {
    if (busy || !candidate) return;
    setBusy(true); setError("");
    try {
      const auth = await getOfflineTeacherSession();
      if (auth?.signedOut || (auth?.user?.id && Number(auth.user.id) !== candidate.teacherId)) throw new Error("Sign in as the assessment's teacher to continue.");
      const current = await getOfflineHostSession(candidate.session.code) || candidate.session;
      const deleted = await getAssessmentState(`deleted-session:${candidate.session.code}`);
      if (deleted?.deleted) throw new Error("This learner has been deleted.");
      const snapshot = await getOfflineTeacherSnapshot(candidate.teacherId);
      if (!recoveryEligible(candidate, { teacherId: candidate.teacherId, host: current, tombstones: snapshot?.learnerTombstones })) throw new Error("This assessment is no longer available. Return to the dashboard.");
      const session = freezeRecoveredSession(candidate.session, candidate.ui?.passageSeconds);
      const body = { action: "host_recover", code: session.code, learner_id: session.learner_id,
        stage: session.stage, currentContent: session.current_content || "", storyTitle: session.story_title,
        elapsed_seconds: candidate.ui?.passageSeconds || 0, checkpoint_at: candidate.savedAt };
      const ui = candidate.ui || {};
      await saveAssessmentState(`passage:${session.code}`, { ...(await getAssessmentState(`passage:${session.code}`) || {}), code: session.code,
        timerSeconds: ui.passageSeconds || 0, wordsRead: ui.passageWordsRead || 0, miscues: ui.passageMiscues || [], comprehension: session.comprehensionResults || [] });
      // Publish the restored host and its ordered replay entry atomically.
      // A reconnect cannot consume the entry before the projection commits.
      const restoredHost = { ...current, ...session, local_pending_sync: !session.ended || Boolean(current.local_pending_sync) };
      if (!session.ended) await enqueueOfflineMutation({ kind: "host_recover", url: "/api/assessment?action=host_recover", method: "POST", body,
        userId: candidate.teacherId, syncLabel: { title: "Recovered assessment", details: ["Assessment progress and paused reading timer"] } }, restoredHost);
      else await saveOfflineHostSession(session.code, restoredHost);
      setRecovered({ ...candidate, session: { ...session, metrics: { ...(session.metrics || {}), remarks: candidate.ui?.terminationRemarks ?? session.metrics?.remarks, observationLevel: candidate.ui?.finalObservationLevel ?? session.metrics?.observationLevel } } }); setCandidate(null);
      window.dispatchEvent(new Event("crl-offline-sync-retry"));
    } catch (cause) { setError(cause?.message || "Unable to restore progress. Please retry."); }
    finally { setBusy(false); }
  };
  const end = async () => {
    if (busy || !candidate) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/assessment?action=host_end", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: candidate.session.code }) });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || "Unable to end assessment. Your progress is still available.");
      resolveTeacherRecovery(candidate.session.code); setLeaving(true); setCandidate(null);
      router.replace("/teacher?tab=conduct");
    } catch (cause) { setError(cause?.message || "Unable to end assessment. Please retry."); }
    finally { setBusy(false); }
  };
  const exit = () => { setLeaving(true); setRecovered(null); router.replace("/teacher?tab=conduct"); };
  if (!checked || leaving) return <div role="status" style={{ padding: 24 }}>Checking assessment progress…</div>;
  if (candidate) return <AssessmentRecoveryDialog title="Continue your assessment?" busy={busy} actions={<>
    <button disabled={busy} onClick={end}>End assessment</button><button data-primary disabled={busy} onClick={recover}>{busy ? "Please wait…" : "Continue assessment"}</button>
  </>}><p>An unfinished assessment was found after the app closed or was interrupted. Continue from the saved progress?</p>
    <p>The reading timer will stay paused until you reconnect the learner and resume.</p>{error ? <p role="alert">{error}</p> : null}</AssessmentRecoveryDialog>;
  if (recovered) return <AssessmentClient key={recovered.session.code} initialCode={recovered.session.code} initialLearnerId={String(recovered.session.learner_id)} initialPeriod={recovered.session.period || "BoSY"} initialRecovery={recovered} onExit={exit} />;
  return children;
}
