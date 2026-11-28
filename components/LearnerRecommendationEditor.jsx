"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RECOMMENDATION_LIMIT } from "../lib/learnerRecommendations.mjs";
import { acquirePageScrollLock } from "../lib/pageScrollLock.mjs";
import { READING_GUIDANCE_URL, generateReadingRecommendation, readingInterventionOptions } from "../lib/readingInterventions.mjs";
import styles from "./LearnerRecommendationEditor.module.css";

export default function LearnerRecommendationEditor({ name, period, profile, value, selected, trigger, fallbackFocus, onSave, onClose }) {
  const [draft, setDraft] = useState(value);
  const [selection, setSelection] = useState(selected);
  const [lastGenerated, setLastGenerated] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const editor = useRef(null);
  const confirmation = useRef(null);
  const pending = useRef(false);
  const selectAll = useRef(null);
  const titleId = useId();
  const confirmId = useId();
  const optionsId = useId();
  const options = readingInterventionOptions(profile, selected);
  const chosen = options.map(item => item.id).filter(id => selection.includes(id));
  const allSelected = chosen.length === options.length;
  const dirty = draft.trim() !== value || chosen.length !== selected.length || chosen.some(id => !selected.includes(id));

  useLayoutEffect(() => {
    const dialog = editor.current;
    const release = acquirePageScrollLock();
    dialog.showModal();
    return () => {
      dialog.close();
      release();
      requestAnimationFrame(() => {
        const next = trigger?.isConnected ? trigger : fallbackFocus.current;
        next?.focus({ preventScroll: true });
      });
    };
  }, [trigger, fallbackFocus]);

  useLayoutEffect(() => {
    if (!confirming) return;
    const dialog = confirmation.current;
    dialog.showModal();
    return () => dialog.close();
  }, [confirming]);

  useLayoutEffect(() => {
    if (selectAll.current) selectAll.current.indeterminate = chosen.length > 0 && !allSelected;
  }, [expanded, allSelected, chosen.length]);

  function requestClose() {
    if (pending.current) return;
    if (dirty) {
      setExpanded(false);
      setConfirming(true);
    } else {
      onClose();
    }
  }

  useEffect(() => {
    const back = event => {
      event.stopImmediatePropagation();
      if (pending.current) return;
      if (confirming) setConfirming(false);
      else requestClose();
    };
    window.addEventListener("crl-pwa-back", back, true);
    return () => window.removeEventListener("crl-pwa-back", back, true);
  });

  function generate() {
    const current = draft.trim();
    const retained = lastGenerated && current.endsWith(lastGenerated)
      ? current.slice(0, -lastGenerated.length).trimEnd()
      : current;
    const generated = generateReadingRecommendation(chosen).split("\n")
      .filter(statement => !retained.includes(statement)).join("\n");
    const next = [retained, generated].filter(Boolean).join("\n\n");
    if (next.length > RECOMMENDATION_LIMIT) {
      setError("Shorten the recommendation to make room for the generated text.");
      return;
    }
    setDraft(next);
    setLastGenerated(generated);
    setExpanded(false);
    setError("");
  }

  async function save(event) {
    event.preventDefault();
    if (pending.current || !dirty) return;
    pending.current = true;
    setSaving(true);
    setExpanded(false);
    setError("");
    try {
      await onSave(draft.trim(), chosen);
      onClose();
    } catch (failure) {
      setError(failure?.message || "Unable to save the recommendation.");
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  return createPortal(
    <>
      <dialog
        ref={editor}
        className={styles.dialog}
        aria-labelledby={titleId}
        data-crl-class-dialog=""
        onCancel={event => {
          event.preventDefault();
          if (expanded) setExpanded(false);
          else requestClose();
        }}
        onClick={event => {
          if (event.target !== event.currentTarget) return;
          const { left, right, top, bottom } = event.currentTarget.getBoundingClientRect();
          if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) requestClose();
        }}
      >
        <header className={styles.header}>
          <div>
            <h2 id={titleId}>{name}</h2>
            <p>{period} · {profile || "No reading profile yet"}</p>
          </div>
          <button type="button" className={styles.close} aria-label="Close recommendation" onClick={requestClose} disabled={saving}>×</button>
        </header>
        <form className={styles.form} onSubmit={save}>
          <div className={styles.field}>
            <span>Intervention</span>
            <button type="button" aria-label="Intervention" className={styles.picker} aria-expanded={expanded} aria-controls={optionsId} disabled={saving}
              onClick={() => setExpanded(open => !open)}>
              <span>{chosen.length ? `${chosen.length} selected` : "Select what applies"}</span>
              <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m5 7.5 5 5 5-5"/></svg>
            </button>
            <fieldset id={optionsId} className={styles.options} hidden={!expanded} disabled={saving} aria-label="Reading interventions">
              <label className={styles.selectAll}>
                <input ref={selectAll} type="checkbox" checked={allSelected} onChange={() => setSelection(allSelected ? [] : options.map(item => item.id))}/>
                Select all
              </label>
              {options.map(({ id, label }) => (
                <label key={id}>
                  <input type="checkbox" checked={selection.includes(id)}
                    onChange={event => { const checked = event.target.checked; setSelection(current => checked ? [...current, id] : current.filter(item => item !== id)); }}/>
                  {label}
                </label>
              ))}
            </fieldset>
            {!expanded && chosen.length > 0 && (
              <ul className={styles.selected}>{options.filter(item => chosen.includes(item.id)).map(item => <li key={item.id}>{item.label}</li>)}</ul>
            )}
          </div>
          <div className={styles.field}>
            <label htmlFor={`${titleId}-text`}>Recommendation</label>
            {chosen.length > 0 && <button type="button" className={styles.generate} onClick={generate} disabled={saving}>Generate recommendation</button>}
            <textarea id={`${titleId}-text`} rows={4} maxLength={RECOMMENDATION_LIMIT} placeholder="Write a recommendation…" value={draft} disabled={saving}
              onChange={event => { setDraft(event.target.value); setError(""); }}/>
          </div>
          <p className={styles.guidance}>See the <a href={READING_GUIDANCE_URL} target="_blank" rel="noreferrer">DepEd reading guidance</a> for more information.</p>
          {!confirming && error && <p className={styles.error} role="alert">{error}</p>}
          <div className={styles.actions}>
            <button type="button" onClick={requestClose} disabled={saving}>Cancel</button>
            <button type="submit" className={styles.primary} disabled={saving || !dirty}>{saving ? "Saving…" : "Save"}</button>
          </div>
        </form>
      </dialog>
      {confirming && (
        <dialog
          ref={confirmation}
          className={`${styles.dialog} ${styles.confirmation}`}
          role="alertdialog"
          aria-labelledby={confirmId}
          onCancel={event => { event.preventDefault(); if (!pending.current) setConfirming(false); }}
        >
          <form className={styles.form} onSubmit={save}>
            <h2 id={confirmId}>Save changes before closing?</h2>
            <p>Your changes to the interventions or recommendation haven’t been saved.</p>
            {error && <p className={styles.error} role="alert">{error}</p>}
            <div className={styles.actions}>
              <button type="button" onClick={() => setConfirming(false)} disabled={saving}>Keep editing</button>
              <button type="button" className={styles.discard} onClick={onClose} disabled={saving}>Discard</button>
              <button type="submit" className={styles.primary} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
            </div>
          </form>
        </dialog>
      )}
    </>,
    document.body
  );
}
