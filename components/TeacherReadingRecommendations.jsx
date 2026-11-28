"use client";

import { useMemo, useRef, useState } from "react";
import LearnerRecommendationEditor from "./LearnerRecommendationEditor";
import Select from "./Select";
import { downloadBlob } from "../lib/downloadFile";
import { READING_PROFILE_LABELS, formatName, profileClass } from "../lib/recordViewModel.mjs";
import { readLearnerInterventions, readLearnerRecommendations } from "../lib/learnerRecommendations.mjs";
import { readingInterventionLabels } from "../lib/readingInterventions.mjs";
import { matchesReadingFollowUp } from "../lib/readingFollowUp.mjs";
import { learnerPeriodProfile } from "../lib/learnerPeriodResults.mjs";
import { buildReadingFollowUpReport } from "../lib/readingFollowUpExport";

export default function TeacherReadingRecommendations({ learners, results, periods, section, year, readOnly, onSave, onError }) {
  const [period, setPeriod] = useState(periods[0]);
  const [profile, setProfile] = useState("Low Emerging Reader");
  const [recommendation, setRecommendation] = useState("");
  const [search, setSearch] = useState("");
  const searchField = useRef(null);
  const [target, setTarget] = useState(null);
  const [exporting, setExporting] = useState(false);
  const visible = useMemo(() => learners
    .filter(learner => matchesReadingFollowUp(learner, results.get(String(learner.id))?.[period], period, profile, recommendation, search))
    .sort((left, right) => formatName(left).localeCompare(formatName(right))),
  [learners, results, period, profile, recommendation, search]);

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
    <div className="recommendationsWorkspace">
      <aside className="panel recommendationFilters" aria-label="Recommendation filters">
        <h2>Filters</h2>
        <label>
          <span>Learner name or LRN</span>
          <input ref={searchField} type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search learners"/>
        </label>
        <label>
          <span>Assessment timeline</span>
          <Select aria-label="Assessment timeline" value={period} onChange={event => setPeriod(event.target.value)}>
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
      </aside>
      <section className="panel recommendationsPanel" aria-label="Reading recommendations">
        <div className="panelHeader recommendationsHeader">
          <div>
            <h2>{section}</h2>
            <p>{year}{readOnly ? " · Read-only" : ""}</p>
          </div>
          <button type="button" className="toolbarButton" disabled={!visible.length || exporting} onClick={exportReport}>
            {exporting ? "Preparing report…" : "Export follow-up report"}
          </button>
        </div>
        <p className="recommendationsCount" role="status">{visible.length} {visible.length === 1 ? "learner" : "learners"}</p>
        {!visible.length && <p className="recommendationsEmpty">No learners match these filters.</p>}
        {visible.length > 0 && (
          <ul className="recommendationsList">
            {visible.map(learner => {
              const name = formatName(learner);
              const saved = readLearnerRecommendations(learner.period_recommendations)[period] ?? "";
              const selected = readLearnerInterventions(learner.period_recommendations, period);
              const learnerProfile = learnerPeriodProfile(results.get(String(learner.id))?.[period]);
              return (
                <li key={learner.id} className="recommendationCard">
                  <div className="recommendationCardHeader">
                    <div>
                      <strong>{name}</strong>
                      <p>LRN: {learner.lrn || "—"} · Sex: {learner.sex || "—"}</p>
                      <span className={learnerProfile ? `badge ${profileClass(learnerProfile)}` : ""}>{learnerProfile || "No reading profile yet"}</span>
                    </div>
                    {!readOnly && (
                      <button type="button" className="toolbarButton" aria-haspopup="dialog" aria-label={`Open recommendation for ${name}`}
                        onClick={event => setTarget({ learner, name, period, profile: learnerProfile, saved, selected, trigger: event.currentTarget })}>Open</button>
                    )}
                  </div>
                  {selected.length > 0 && <p className="recommendationCardInterventions">{readingInterventionLabels(selected).join(" · ")}</p>}
                  {(saved || !selected.length) && <p className="recommendationCardNote">{saved || "No recommendation yet"}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {target && (
        <LearnerRecommendationEditor
          name={target.name}
          period={target.period}
          profile={target.profile}
          value={target.saved}
          selected={target.selected}
          trigger={target.trigger}
          fallbackFocus={searchField}
          onSave={(text, ids) => onSave(target.learner, target.period, text, ids)}
          onClose={() => setTarget(null)}
        />
      )}
    </div>
  );
}
