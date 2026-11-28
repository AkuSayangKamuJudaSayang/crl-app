"use client";

import { useRef, useState } from "react";
import ClassDialog from "./ClassDialog";
import Select from "./Select";
import styles from "./ClassWorkspace.module.css";
import {
  readLearnerRecommendations, RECOMMENDATION_LIMIT, RECOMMENDATION_PERIODS, RECOMMENDATION_PRESETS,
} from "../lib/learnerRecommendations.mjs";

export default function LearnerRecommendationsDialog({ name, recommendations, onSave, onClose }) {
  const [original] = useState(() => readLearnerRecommendations(recommendations));
  const [drafts, setDrafts] = useState(original);
  const [period, setPeriod] = useState(RECOMMENDATION_PERIODS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const text = drafts[period] ?? "";
  const changes = Object.fromEntries(RECOMMENDATION_PERIODS.flatMap(item => {
    const content = (drafts[item] ?? "").trim();
    return content === (original[item] ?? "") ? [] : [[item, content]];
  }));

  const updateText = value => setDrafts(current => ({ ...current, [period]: value }));
  async function save(event) {
    event.preventDefault();
    if (pending.current || !Object.keys(changes).length) return;
    pending.current = true;
    setSaving(true);
    setError("");
    try {
      await onSave(changes);
      onClose();
    } catch (failure) {
      setError(failure.message || "Unable to save recommendations. Try again.");
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  return (
    <ClassDialog title="Learner recommendations" onClose={() => { if (!pending.current) onClose(); }} busy={saving} showClose>
      <form onSubmit={save} className={styles.recommendationsForm}>
        <p className={styles.recommendationLearner}>{name}</p>
        <div className={styles.recommendationPeriods} role="group" aria-label="Assessment period">
          {RECOMMENDATION_PERIODS.map(item => (
            <button type="button" key={item} className={styles.button} aria-pressed={period === item} disabled={saving} onClick={() => setPeriod(item)}>
              {item}{Object.hasOwn(changes, item) && <span aria-label="Unsaved changes"> •</span>}
            </button>
          ))}
        </div>
        <label>
          <span>Recommendation presets</span>
          <Select
            aria-label="Recommendation presets"
            value={RECOMMENDATION_PRESETS.includes(text) ? text : ""}
            disabled={saving}
            onChange={event => { if (event.target.value) updateText(event.target.value); }}
          >
            <option value="" disabled hidden>Choose a preset</option>
            {RECOMMENDATION_PRESETS.map(preset => <option key={preset} value={preset}>{preset}</option>)}
          </Select>
        </label>
        <label>
          <span>{period} recommendation</span>
          <textarea aria-label={`${period} recommendation`} rows={4} value={text} maxLength={RECOMMENDATION_LIMIT} disabled={saving} placeholder="Choose a preset or write a recommendation." onChange={event => updateText(event.target.value)} />
        </label>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <div className={styles.actions}>
          <button type="button" className={styles.button} disabled={saving} onClick={onClose}>Cancel</button>
          <button type="submit" className={styles.primary} disabled={saving || !Object.keys(changes).length}>{saving ? "Saving…" : "Save recommendations"}</button>
        </div>
      </form>
    </ClassDialog>
  );
}
