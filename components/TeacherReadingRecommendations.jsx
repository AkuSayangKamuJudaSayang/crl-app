"use client";

import { useMemo, useState } from "react";
import LearnerRecommendationEditor from "./LearnerRecommendationEditor";
import Select from "./Select";
import { downloadBlob } from "../lib/downloadFile";
import { READING_PROFILE_LABELS, formatName } from "../lib/recordViewModel.mjs";
import { readLearnerRecommendations } from "../lib/learnerRecommendations.mjs";
import { matchesReadingFollowUp } from "../lib/readingFollowUp.mjs";
import { learnerPeriodProfile } from "../lib/learnerPeriodResults.mjs";
import { buildReadingFollowUpReport } from "../lib/readingFollowUpExport";

export default function TeacherReadingRecommendations({ learners, results, periods, section, year, readOnly, getDraft, onDraftChange, onSave, onError }) {
  const [period, setPeriod] = useState(periods[0]);
  const [profile, setProfile] = useState("Low Emerging Reader");
  const [recommendation, setRecommendation] = useState("");
  const [openLearnerId, setOpenLearnerId] = useState(null);
  const [exporting, setExporting] = useState(false);
  const visible = useMemo(() => learners
    .filter(learner => matchesReadingFollowUp(learner, results.get(String(learner.id))?.[period], period, profile, recommendation))
    .sort((left, right) => formatName(left).localeCompare(formatName(right))),
  [learners, results, period, profile, recommendation]);

  async function exportReport() {
    if (exporting || !visible.length) return;
    setExporting(true);
    try {
      const { blob, filename } = await buildReadingFollowUpReport({ learners: visible, results, period, section, year });
      downloadBlob(blob, filename);
    } catch (error) {
      onError(error?.message || "Unable to export the follow-up report.", "error");
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="panel recommendationsPanel" aria-label="Reading recommendations">
      <div className="panelHeader recommendationsHeader">
        <h2>{section}</h2>
        <span>{year}{readOnly ? " · Read-only" : ""}</span>
      </div>
      <div className="readingFollowUpBar">
        <label>
          <span>Assessment timeline</span>
          <Select aria-label="Assessment timeline" value={period} onChange={event => { setPeriod(event.target.value); setOpenLearnerId(null); }}>
            {periods.map(item => <option key={item} value={item}>{item}</option>)}
          </Select>
        </label>
        <label>
          <span>Reading profile</span>
          <Select aria-label="Reading profile" value={profile} onChange={event => setProfile(event.target.value)}>
            <option value="">All profiles</option>
            {READING_PROFILE_LABELS.map(item => <option key={item} value={item}>{item}</option>)}
            <option value="unassessed">No reading profile yet</option>
          </Select>
        </label>
        <label>
          <span>Recommendation status</span>
          <Select aria-label="Recommendation status" value={recommendation} onChange={event => setRecommendation(event.target.value)}>
            <option value="">All recommendations</option>
            <option value="with">With recommendation</option>
            <option value="without">Without recommendation</option>
          </Select>
        </label>
        <button type="button" className="toolbarButton readingFollowUpExport" disabled={!visible.length || exporting} onClick={exportReport}>
          {exporting ? "Preparing report…" : "Export follow-up report"}
        </button>
      </div>
      <p className="recommendationsCount" role="status">{visible.length} {visible.length === 1 ? "learner" : "learners"}</p>
      {!visible.length && <p className="recommendationsEmpty">No learners match these filters.</p>}
      <ul className="recommendationsList">
        {visible.map(learner => {
          const name = formatName(learner);
          const saved = readLearnerRecommendations(learner.period_recommendations)[period] ?? "";
          const learnerProfile = learnerPeriodProfile(results.get(String(learner.id))?.[period]);
          const open = openLearnerId === learner.id && !readOnly;
          return (
            <li key={learner.id} className="recommendationCard">
              <div className="recommendationCardHeader">
                <div>
                  <strong>{name}</strong>
                  <p>{learnerProfile || "No reading profile yet"}</p>
                </div>
                {!readOnly && <button type="button" className="toolbarButton" aria-expanded={open} aria-label={`Intervention for ${name}`} onClick={() => setOpenLearnerId(open ? null : learner.id)}>{open ? "Close" : "Open"}</button>}
              </div>
              {open ? (
                <LearnerRecommendationEditor
                  key={period}
                  name={name}
                  period={period}
                  profile={learnerProfile}
                  value={saved}
                  draft={getDraft(learner, period) ?? saved}
                  onDraftChange={text => onDraftChange(learner, period, text)}
                  onSave={text => onSave(learner, period, text)}
                  onCancel={() => onDraftChange(learner, period, undefined)}
                  onClose={() => setOpenLearnerId(current => current === learner.id ? null : current)}
                />
              ) : <p className="recommendationCardNote">{saved || "No recommendation yet"}</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
