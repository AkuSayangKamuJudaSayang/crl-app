"use client";

import { useRef, useState } from "react";
import { RECOMMENDATION_LIMIT } from "../lib/learnerRecommendations.mjs";

export default function LearnerRemarksField({ name, period, value, draft, readOnly, onChange, onSave }) {
  const pending = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (readOnly || pending.current || draft === undefined) return;
    if (draft.trim() === value) {
      onChange(undefined);
      return;
    }
    pending.current = true;
    setSaving(true);
    setError("");
    try {
      await onSave(draft.trim());
    } catch (failure) {
      setError(failure?.message || "Could not save. Leave the field to retry.");
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="rosterRemarks">
      <textarea
        aria-label={`${period} recommendation remarks for ${name}`}
        rows={2}
        maxLength={RECOMMENDATION_LIMIT}
        placeholder={readOnly ? "No remarks" : "Type a remark…"}
        readOnly={readOnly || saving}
        value={draft ?? value}
        onChange={event => { onChange(event.target.value); setError(""); }}
        onBlur={save}
      />
      {saving && <small role="status">Saving…</small>}
      {error && <small className="readingRecommendationError" role="alert">{error}</small>}
    </div>
  );
}
