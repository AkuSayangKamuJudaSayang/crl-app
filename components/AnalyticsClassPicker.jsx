"use client";

import { useId } from "react";
import { analyticsClassChoices } from "../lib/analyticsClassScope.mjs";
import styles from "./AnalyticsClassPicker.module.css";

export default function AnalyticsClassPicker({ catalog, teacherId, yearId, sectionId, onYearChange, onSectionChange, loaded }) {
  const id = useId();
  const { years, sections } = analyticsClassChoices(catalog, teacherId);
  const choices = sections.filter(row => row.schoolYearId === yearId)
    .sort((a, b) => a.name.localeCompare(b.name));
  const message = !loaded ? "Loading school years and sections..." : !years.length
    ? "No school years yet. Create your classes in Conduct Assessment or Assessment Records."
    : !yearId ? "Choose a school year and section to view its analytics."
    : !choices.length ? "No sections in this school year. Manage your classes in Conduct Assessment or Assessment Records."
    : !sectionId ? "Choose a section to view its charts and learner results." : "Charts and learner results show only this class.";
  return <section className={styles.picker} aria-label="Analytics class selection">
    <div className={styles.fields}>
      <label htmlFor={`${id}-year`}><span>School year</span><select id={`${id}-year`} value={yearId} disabled={!loaded || !years.length} aria-describedby={`${id}-hint`} onChange={e => onYearChange(e.target.value)}>
        <option value="">Choose School Year</option>
        {years.map(row => <option key={row.id} value={row.id}>S.Y. {row.label}{row.archivedAt ? " · Archived" : ""}</option>)}
      </select></label>
      <label htmlFor={`${id}-section`}><span>Section</span><select id={`${id}-section`} value={sectionId} disabled={!loaded || !yearId || !choices.length} aria-describedby={`${id}-hint`} onChange={e => onSectionChange(e.target.value)}>
        <option value="">Choose Section</option>
        {choices.map(row => <option key={row.id} value={row.id}>{row.name}{row.archivedAt ? " · Archived" : ""}</option>)}
      </select></label>
    </div>
    <p id={`${id}-hint`} role="status">{message}</p>
  </section>;
}
