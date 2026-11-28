"use client";

import { useEffect, useRef, useState } from "react";
import Select from "./Select";
import { RECOMMENDATION_LIMIT } from "../lib/learnerRecommendations.mjs";
import { READING_GUIDANCE_URL, readingFollowUpGuidance } from "../lib/readingFollowUp.mjs";

export default function LearnerRecommendationEditor({ name, period, profile, value, draft, onDraftChange, onSave, onCancel, onClose }) {
  const [preset, setPreset] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const form = useRef(null);
  const { recommendation, interventions } = readingFollowUpGuidance(profile);
  const locked = saving;

  useEffect(() => {
    form.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
    form.current?.focus({ preventScroll: true });
  }, []);

  function append(text) {
    const next = [draft.trim(), text].filter(Boolean).join("\n");
    if (next.length > RECOMMENDATION_LIMIT) {
      setError("Shorten the recommendation before adding more text.");
      return;
    }
    onDraftChange(next);
    setError("");
  }

  async function save(event) {
    event.preventDefault();
    if (pending.current || draft.trim() === value) return;
    pending.current = true;
    setSaving(true);
    setError("");
    try {
      await onSave(draft.trim());
      onClose();
    } catch (failure) {
      setError(failure.message || "Unable to save the recommendation.");
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  return (
    <form ref={form} tabIndex={-1} className="readingRecommendationEditor" aria-label={`Edit ${period} recommendation for ${name}`} onSubmit={save}>
      {recommendation && (
        <div className="readingRecommendationSuggestion">
          <p>{recommendation}</p>
          <button type="button" className="toolbarButton" disabled={locked || draft.includes(recommendation)} onClick={() => append(recommendation)}>Use suggestion</button>
        </div>
      )}
      <div className="readingInterventionPicker">
        <label>
          <span>Predefined intervention</span>
          <Select aria-label="Predefined intervention" value={preset} disabled={locked} onChange={event => setPreset(event.target.value)}>
            <option value="">Choose an intervention</option>
            {interventions.map(([label, text]) => <option key={label} value={text}>{label}</option>)}
          </Select>
        </label>
        <button type="button" className="toolbarButton" disabled={locked || !preset || draft.includes(preset)} onClick={() => append(preset)}>Add intervention</button>
      </div>
      <label className="readingRecommendationInput">
        <span>Recommendation / intervention</span>
        <textarea aria-label="Recommendation / intervention" rows={3} maxLength={RECOMMENDATION_LIMIT} disabled={locked} value={draft} placeholder="Write your own intervention or edit the suggested text." onChange={event => { onDraftChange(event.target.value); setError(""); }} />
      </label>
      {error && <p className="readingRecommendationError" role="alert">{error}</p>}
      <div className="readingRecommendationActions">
        <a href={READING_GUIDANCE_URL} target="_blank" rel="noreferrer">DepEd reading guidance</a>
        <button type="button" className="toolbarButton" disabled={saving} onClick={() => { onCancel(); onClose(); }}>Cancel</button>
        <button type="submit" className="toolbarButton primaryBlueButton" disabled={locked || draft.trim() === value}>{saving ? "Saving…" : "Save"}</button>
      </div>
    </form>
  );
}
