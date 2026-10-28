"use client";

import { ALL_ANALYTICS_SECTIONS, analyticsClassChoices } from "../lib/analyticsClassScope.mjs";
import styles from "./ClassWorkspace.module.css";

export default function AnalyticsClassPicker({ catalog, teacherId, yearId, sectionId, onYearChange, onSectionChange, loaded, onBack }) {
  const { years, sections } = analyticsClassChoices(catalog, teacherId);
  const year = years.find(row => row.id === yearId);
  const choices = sections.filter(row => row.schoolYearId === year?.id)
    .sort((a, b) => a.name.localeCompare(b.name));
  const section = choices.find(row => row.id === sectionId);
  const allSections = Boolean(year && choices.length && sectionId === ALL_ANALYTICS_SECTIONS);
  const selected = section || allSections;
  return <section className={styles.workspace} aria-label="Analytics class selection">
    {onBack && year && <button type="button" className={styles.backArrow} onClick={onBack} aria-label={selected ? "Back to sections" : "Back to school years"} title={selected ? "Back to sections" : "Back to school years"}><span aria-hidden="true">←</span></button>}
    <div className={styles.header}><div className={styles.heading}>
      {selected ? <h2>S.Y. {year.label} · {allSections ? "All Sections" : section.name}</h2>
        : year ? <><h2 className={styles.yearTitle}>S.Y. {year.label}</h2><p className={styles.subtitle}>Choose Section</p></>
        : <h2>Choose School Year</h2>}
    </div></div>
    {!loaded ? <p role="status">Loading school years and sections...</p>
      : selected ? <p role="status">{allSections ? "One combined reading profile graph for all sections in this school year. No individual learner results are shown." : "Charts and learner results show only this class."}</p>
      : <>
        <p>{year ? "Choose a section, or view one combined graph for all sections in this school year." : "Choose a school year, then a section to view its analytics."}</p>
        {!(year ? choices : years).length ? <div className={styles.empty}>
          <h3>{year ? "No sections yet" : "No school years yet"}</h3>
          <p>Manage your classes in Conduct Assessment or Assessment Records.</p>
        </div> : <div className={styles.cards}>
          {year && <div className={styles.card}><button type="button" className={styles.choice} onClick={() => onSectionChange(ALL_ANALYTICS_SECTIONS)}><strong>All Sections</strong><span>Combined reading profile graph for this school year</span></button></div>}
          {(year ? choices : years).map(item => <div className={styles.card} key={item.id}>
            <button type="button" className={styles.choice} onClick={() => year ? onSectionChange(item.id) : onYearChange(item.id)}>
              <strong>{year ? item.name : `S.Y. ${item.label}`}</strong>
              <span>{year ? "View class analytics" : `${sections.filter(row => row.schoolYearId === item.id).length} sections`}{item.archivedAt ? " · Archived" : ""}</span>
            </button>
          </div>)}
        </div>}
      </>}
  </section>;
}
