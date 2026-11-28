"use client";

import { useRef, useState } from "react";
import ClassDialog from "./ClassDialog";
import Select from "./Select";
import { unlockDeletionKey, signLearnerDeletion } from "../lib/deletionPasswordClient.mjs";
import styles from "./ClassWorkspace.module.css";

const REASONS = ["Typo or incorrect learner information", "Duplicate enrollment", "Learner transferred", "Enrolled in the wrong section"];

export default function ArchiveLearnersDialog({ learners, user, rosterVersion = 0, onCancel, onConfirm, busy }) {
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("");
  const [otherReason, setOtherReason] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const locked = busy || verifying;
  const archiveReason = reason === "other" ? otherReason.trim() : reason;
  const canSubmit = Boolean(learners.length && password && (reason !== "other" || archiveReason));

  const cancel = () => {
    if (!pending.current && !busy) onCancel();
  };

  const submit = async event => {
    event.preventDefault();
    if (pending.current || busy || !canSubmit) return;
    pending.current = true;
    setVerifying(true);
    setError("");
    try {
      if (learners.length > 500) throw Error("Select at most 500 learners at a time.");
      const unlocked = await unlockDeletionKey(password, user);
      const base = {
        deletion_reason: archiveReason,
        roster_version: rosterVersion,
        ...(learners.length > 1 ? { deletion_group_id: crypto.randomUUID() } : {}),
      };
      const jobs = await Promise.all(learners.map(async learner => {
        const target = { id: Number(learner.id), lrn: learner.lrn ?? learner.LRN };
        return { id: target.id, body: await signLearnerDeletion("delete_learners", base, [target], unlocked) };
      }));
      setPassword("");
      if (await onConfirm({ jobs }) === false) setError("Archiving could not start. Review the message and try again.");
    } catch (failure) {
      setPassword("");
      setError(failure.message || "Unable to confirm archiving.");
    } finally {
      pending.current = false;
      setVerifying(false);
    }
  };

  return (
    <ClassDialog title={learners.length === 1 ? "Archive learner" : "Archive selected learners"} onClose={cancel} busy={locked}>
      <form onSubmit={submit} className={styles.archiveLearnersForm}>
        <p>{learners.length === 1 ? "This learner and their results will move to Archives." : `${learners.length} learners and their results will move to Archives.`} Archives are kept for 30 days after syncing.</p>
        <label>
          <span>Archive reason (optional)</span>
          <Select aria-label="Archive reason (optional)" value={reason} disabled={locked} onChange={event => setReason(event.target.value)}>
            <option value="">Choose a reason</option>
            {REASONS.map(label => <option key={label} value={label}>{label}</option>)}
            <option value="other">Other (specify)</option>
          </Select>
        </label>
        {reason === "other" && (
          <label>
            <span>Specify the reason</span>
            <textarea rows={2} maxLength={300} required disabled={locked} value={otherReason} onChange={event => setOtherReason(event.target.value)} />
          </label>
        )}
        <label>
          <span>Account password</span>
          <input type="password" value={password} required disabled={locked} onChange={event => { setPassword(event.target.value); setError(""); }} autoComplete="current-password" spellCheck={false} />
        </label>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <div className={styles.actions}>
          <button type="button" className={styles.button} disabled={locked} onClick={cancel}>Cancel</button>
          <button type="submit" className={styles.danger} disabled={locked || !canSubmit}>{locked ? "Confirming…" : "Confirm archive"}</button>
        </div>
      </form>
    </ClassDialog>
  );
}
