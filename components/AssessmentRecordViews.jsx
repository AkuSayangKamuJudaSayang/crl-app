"use client";
import {Fragment} from 'react';
import {SCORESHEET_GRID_WIDTHS,CLASS_SUMMARY_TOP_WIDTHS,CLASS_SUMMARY_DETAIL_WIDTHS,CLASS_RECORD_WIDTHS,recordSummaryFor,countPart1,classSummaryAverage,classSummaryPercent,classSummaryWpm,formatName,profileClass,READING_PROFILE_LABELS,PART1_LEVEL_LABELS,normalizeReadingProfile,hasRecordedPassageAssessment,getRecordWordsRead,getRecordFluency,getRecordProfile,calculateFallbackProfile} from '../lib/recordViewModel.mjs';
import './AssessmentRecordViews.css';
// One renderer for the teacher workbook views and the coordinator's read-only views.
export default function AssessmentRecordViews({readOnly=false,recordsView,currentRecords,currentPeriod,learners,selectedClass,user,classSummaryRows,scoresheetHeader,scoresheetZoom,setScoresheetZoom,scoresheetMode,setScoresheetMode,classReadonly,savingScoresheet,scoresheetDirty,deletingProgress,requestScoresheetNavigation,saveScoresheetChanges,scoresheetValue,updateScoresheetDraft}){return <div className="assessmentRecordViews">{recordsView ===
                    "summary" ? (
                      <div className="recordSummary">
                        <div className="summaryTableWrap">
                          <table
                            className="classSummaryTable classSummaryTopTable"
                            aria-label="Class summary by sex"
                          >
                            <colgroup>
                              {CLASS_SUMMARY_TOP_WIDTHS.map((width, index) => (
                                <col key={`summary-top-column-${index}`} style={{ width }} />
                              ))}
                            </colgroup>
                            <thead>
                              <tr className="classSummaryGroupRow">
                                <th rowSpan={2}>Grade</th>
                                <th aria-label="Section heading" />
                                <th aria-label="Teacher heading" />
                                <th rowSpan={2}>Language</th>
                                <th rowSpan={2}>Sex</th>
                                <th rowSpan={2}>Number of Learners Enrolled</th>
                                <th rowSpan={2}>Number of Learners Assessed</th>
                                <th colSpan={4}>Assessment Part 1 Reading Level</th>
                                <th colSpan={3}>Average Score</th>
                                <th colSpan={5}>READING PROFILE</th>
                              </tr>
                              <tr className="classSummaryLeafRow">
                                <th>Section</th>
                                <th>Teacher</th>
                                <th>Full Refresher</th>
                                <th>Moderate Refresher</th>
                                <th>Light Refresher</th>
                                <th>Grade Ready</th>
                                <th>Reading Fluency</th>
                                <th>Reading Comprehension</th>
                                <th>Average Word Per Minute</th>
                                <th>Low Emerging Reader</th>
                                <th>High Emerging Reader</th>
                                <th>Developing Reader</th>
                                <th>Transitioning Reader</th>
                                <th>Reading At Grade Level</th>
                              </tr>
                            </thead>
                            <tbody>
                              {classSummaryRows.map((row, index) => (
                                <Fragment key={row.group}>
                                  {index === 2 && (
                                    <tr className="classSummarySpacerRow" aria-hidden="true">
                                      <td colSpan={19} />
                                    </tr>
                                  )}
                                  <tr
                                    className={
                                      row.group === "Total" ? "classSummaryTotalRow" : ""
                                    }
                                  >
                                    <td>Grade 3</td>
                                    <td>{selectedClass?.name || ""}</td>
                                    <td>{user?.full_name || "—"}</td>
                                    <td>English</td>
                                    <td>{row.group}</td>
                                    <td>{row.enrolled}</td>
                                    <td>{row.assessed}</td>
                                    {row.part1Counts.map((value, partIndex) => (
                                      <td key={`${row.group}-part1-${partIndex}`}>{value}</td>
                                    ))}
                                    <td>{classSummaryPercent(row.averageFluency)}</td>
                                    <td>
                                      {classSummaryPercent(
                                        row.averageComprehension === null
                                          ? null
                                          : (row.averageComprehension / 6) * 100
                                      )}
                                    </td>
                                    <td>{classSummaryWpm(row.averageWpm, 2)}</td>
                                    {row.profileCounts.map((value, profileIndex) => (
                                      <td
                                        className="classSummaryProfileCell"
                                        key={`${row.group}-profile-${profileIndex}`}
                                      >
                                        {value}
                                      </td>
                                    ))}
                                  </tr>
                                </Fragment>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <div className="summaryDetailSection">
                          <div className="summaryDetailScroller">
                            <table
                              className="classSummaryTable classSummaryDetailTable"
                              aria-label="Percent of learners at each proficiency level"
                            >
                              <colgroup>
                                {CLASS_SUMMARY_DETAIL_WIDTHS.map((width, index) => (
                                  <col key={`summary-detail-column-${index}`} style={{ width }} />
                                ))}
                              </colgroup>
                              <thead>
                                <tr className="classSummaryTitleRow">
                                  <th colSpan={15}>
                                    Percent (%) of Learners at Each Proficiency Level
                                  </th>
                                </tr>
                                <tr className="classSummaryGroupRow">
                                  <th aria-label="Language heading" />
                                  <th aria-label="Sex heading" />
                                  <th aria-label="Percent assessed heading" />
                                  <th colSpan={4}>Assessment Part 1 Reading Level</th>
                                  <th colSpan={3}>Average Score</th>
                                  <th colSpan={5}>READING PROFILE</th>
                                </tr>
                                <tr className="classSummaryLeafRow">
                                  <th>Language</th>
                                  <th>Sex</th>
                                  <th>Percent of Learners assessed</th>
                                  <th>Full Refresher</th>
                                  <th>Moderate Refresher</th>
                                  <th>Light Refresher</th>
                                  <th>Grade Ready</th>
                                  <th>Reading Fluency</th>
                                  <th>Reading Comprehension</th>
                                  <th>Average Word Per Minute</th>
                                  <th>Low Emerging Reader</th>
                                  <th>High Emerging Reader</th>
                                  <th>Developing Reader</th>
                                  <th>Transitioning Reader</th>
                                  <th>Reading At Grade Level</th>
                                </tr>
                              </thead>
                              <tbody>
                                {classSummaryRows.map((row) => {
                                  const valuePercent = (count) =>
                                    row.assessed > 0
                                      ? (Number(count) / row.assessed) * 100
                                      : 0;

                                  return (
                                    <tr
                                      className={
                                        row.group === "Total" ? "classSummaryTotalRow" : ""
                                      }
                                      key={row.group}
                                    >
                                      <td>English</td>
                                      <td>{row.group}</td>
                                      <td>{classSummaryPercent(row.assessedPercent)}</td>
                                      {row.part1Counts.map((count, partIndex) => (
                                        <td key={`${row.group}-detail-part1-${partIndex}`}>
                                          {classSummaryPercent(valuePercent(count))}
                                        </td>
                                      ))}
                                      <td>{classSummaryPercent(row.averageFluency)}</td>
                                      <td>
                                        {classSummaryPercent(
                                          row.averageComprehension === null
                                            ? null
                                            : (row.averageComprehension / 6) * 100
                                        )}
                                      </td>
                                      <td>{classSummaryWpm(row.averageWpm, 0)}</td>
                                      {row.profileCounts.map((count, profileIndex) => (
                                        <td
                                          className="classSummaryProfileCell"
                                          key={`${row.group}-detail-profile-${profileIndex}`}
                                        >
                                          {classSummaryPercent(valuePercent(count))}
                                        </td>
                                      ))}
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>

                          <div className="summaryMetricGrid">
                            <div className="summaryMetricCard">
                              <div className="summaryMetricTitle">
                                % of Learners Assessed
                              </div>
                              {["Male", "Female"].map((group) => {
                                const assessed =
                                  recordSummaryFor(currentRecords, group).length;
                                const enrolled =
                                  learners.filter(
                                    (learner) =>
                                      String(learner.sex || "").toLowerCase() ===
                                      group.toLowerCase()
                                  ).length;
                                const percent = enrolled
                                  ? (assessed / enrolled) * 100
                                  : 0;
                                return (
                                  <div className="summaryMetricRow" key={group}>
                                    <span>{group}</span>
                                    <div className="summaryMetricBar" aria-hidden="true">
                                      <div
                                        className={`summaryMetricBarFill is${group}`}
                                        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
                                      />
                                    </div>
                                    <strong>{percent.toFixed(2)}%</strong>
                                  </div>
                                );
                              })}
                            </div>

                            <div className="summaryMetricCard">
                              <div className="summaryMetricTitle">
                                % of G3 Learners Assessed in English by Assessment Part 1 Reading Level
                              </div>
                              {PART1_LEVEL_LABELS.map((label) => {
                                const rowsForGroup =
                                  recordSummaryFor(currentRecords, "Total");
                                const percent = rowsForGroup.length
                                  ? (countPart1(rowsForGroup, label) /
                                      rowsForGroup.length) *
                                    100
                                  : 0;
                                return (
                                  <div className="summaryMetricRow" key={label}>
                                    <span>{label}</span>
                                    <div className="summaryMetricBar" aria-hidden="true">
                                      <div
                                        className="summaryMetricBarFill"
                                        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
                                      />
                                    </div>
                                    <strong>{percent.toFixed(2)}%</strong>
                                  </div>
                                );
                              })}
                            </div>

                            <div className="summaryMetricCard">
                              <div className="summaryMetricTitle">
                                % of G3 Learners Assessed in English by Assessment Part 2 Reading Level
                              </div>
                              {READING_PROFILE_LABELS.map((label) => {
                                const rowsForGroup =
                                  recordSummaryFor(currentRecords, "Total");
                                const percent = rowsForGroup.length
                                  ? (rowsForGroup.filter(
                                      (item) => item.profile === label
                                    ).length /
                                      rowsForGroup.length) *
                                    100
                                  : 0;
                                return (
                                  <div className="summaryMetricRow" key={label}>
                                    <span>{label}</span>
                                    <div className="summaryMetricBar" aria-hidden="true">
                                      <div
                                        className="summaryMetricBarFill"
                                        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
                                      />
                                    </div>
                                    <strong>{percent.toFixed(2)}%</strong>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>                      </div>
                    ) : recordsView ===
                    "class-record" ? (
                      <div className="recordTemplateView">
                        <div className="recordTemplateScroller" role="region" aria-label="Class record, scroll rows and columns" tabIndex={0}>
                          <table className="recordTemplateTable classRecordTable classRecordWorkbookTable">
                            <colgroup>
                              {CLASS_RECORD_WIDTHS.map((width, index) => (
                                <col key={`class-record-column-${index}`} style={{ width: `${width}px` }} />
                              ))}
                            </colgroup>
                            <thead>
                              <tr className="classRecordWorkbookMetaRow">
                                <th colSpan={2} className="classRecordMetaLabel">School</th>
                                <th colSpan={2} className="classRecordMetaValue">
                                  {user?.school_name || user?.school_id || ""}
                                </th>
                                <th colSpan={7} rowSpan={3} className="classRecordWorkbookTitle">
                                  GRADE 3 Reading Assessment CLASS RECORD
                                </th>
                              </tr>
                              <tr className="classRecordWorkbookMetaRow">
                                <th colSpan={2} className="classRecordMetaLabel">Teacher</th>
                                <th colSpan={2} className="classRecordMetaValue">{user?.full_name || ""}</th>
                              </tr>
                              <tr className="classRecordWorkbookMetaRow">
                                <th colSpan={2} className="classRecordMetaLabel">Grade Level</th>
                                <th colSpan={2} className="classRecordMetaValue">Grade 3</th>
                              </tr>
                              <tr className="classRecordLanguageRow">
                                <th rowSpan={3}>S/N</th>
                                <th rowSpan={3}>LRN</th>
                                <th rowSpan={3}>Name of Learner</th>
                                <th rowSpan={3}>Sex</th>
                                <th colSpan={6} className="classRecordEnglishBand">English</th>
                                <th rowSpan={3} className="classRecordRemarksHead">Remarks</th>
                              </tr>
                              <tr className="classRecordGroupRow classRecordEnglishRow">
                                <th colSpan={2}>Assessment Part 1</th>
                                <th colSpan={3}>Assessment Part 2</th>
                                <th rowSpan={2}>READING PROFILE</th>
                              </tr>
                              <tr className="classRecordSubheadRow classRecordEnglishRow">
                                <th>Assessment Part 1<br />Reading Level</th>
                                <th>% of Total<br />Score</th>
                                <th>Reading<br />Fluency</th>
                                <th>Reading<br />Comprehension</th>
                                <th>Average<br />Word Per Minute</th>
                              </tr>
                            </thead>
                            <tbody>
                              {currentRecords.length === 0 ? (
                                <tr>
                                  <td colSpan={11}>
                                    <div className="emptyState">
                                      <div className="emptyIcon">▤</div>
                                      <h3>No records for {currentPeriod}</h3>
                                      <p>Completed assessments will appear here after they are saved to the database.</p>
                                    </div>
                                  </td>
                                </tr>
                              ) : (
                                currentRecords.slice().sort((left, right) =>
                                  formatName(left.learner).localeCompare(formatName(right.learner))
                                ).map(({ assessment, learner }, index) => {
                                  const total =
                                    Number(assessment.task1_score || 0) +
                                    Number(assessment.task2_score || 0);
                                  const profile =
                                    getRecordProfile(
                                      assessment
                                    );
                                  const readingPctValue =
                                    getRecordFluency(
                                      assessment
                                    );
                                  const readingPct =
                                    readingPctValue === null
                                      ? ""
                                      : Math.round(readingPctValue) + "%";
                                  const wordsRead =
                                    getRecordWordsRead(
                                      assessment
                                    );
                                  const seconds = Number(assessment.timer_seconds ?? 0);
                                  const wpm =
                                    assessment.wpm ??
                                    (seconds > 0
                                      ? Math.round((Number(wordsRead) / seconds) * 60)
                                      : "");
                                  const passageAdministered = hasRecordedPassageAssessment(assessment);
                                  const profileTone = profile === "Reading At Grade Level"
                                    ? " classRecordProfileGrade"
                                    : profile === "Low Emerging Reader"
                                      ? " classRecordProfileLow"
                                      : "";

                                  return (
                                    <tr key={assessment.id}>
                                      <td>{index + 1}</td>
                                      <td>{learner.lrn}</td>
                                      <td className="nameStrong">{formatName(learner)}</td>
                                      <td>{learner.sex}</td>
                                      <td className="classRecordEnglishCell">{!assessment.is_completed ? "" : total <= 0 ? "Full Refresher" : total <= 10 ? "Moderate Refresher" : total <= 16 ? "Light Refresher" : "Grade Ready"}</td>
                                      <td className="classRecordEnglishCell">{assessment.is_completed ? `${Math.round((total / 20) * 100)}%` : ""}</td>
                                      <td className="classRecordEnglishCell">{passageAdministered ? readingPct : ""}</td>
                                      <td className="classRecordEnglishCell">{passageAdministered ? `${Math.round((Number(assessment.comprehension_score || 0) / 6) * 100)}%` : ""}</td>
                                      <td className="classRecordEnglishCell">{passageAdministered ? wpm : ""}</td>
                                      <td className={`classRecordEnglishCell classRecordProfileCell${profileTone}`}>{profile}</td>
                                      <td>{assessment.remarks || ""}</td>
                                    </tr>
                                  );
                                })
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : (
                      <div className="scoresheetView">
                        <div className="scoresheetControls" aria-label="Scoresheet controls">
                          <div className="scoresheetZoomControls" role="group" aria-label="Scoresheet zoom">
                            <button
                              type="button"
                              className="scoresheetControlButton"
                              aria-label="Zoom out"
                              disabled={scoresheetZoom <= 0.65}
                              onClick={() =>
                                setScoresheetZoom((current) =>
                                  Math.max(0.65, Number((current - 0.1).toFixed(2)))
                                )
                              }
                            >
                              −
                            </button>
                            <span>{Math.round(scoresheetZoom * 100)}%</span>
                            <button
                              type="button"
                              className="scoresheetControlButton"
                              aria-label="Zoom in"
                              disabled={scoresheetZoom >= 1.35}
                              onClick={() =>
                                setScoresheetZoom((current) =>
                                  Math.min(1.35, Number((current + 0.1).toFixed(2)))
                                )
                              }
                            >
                              +
                            </button>
                          </div>

                          {!readOnly && <div className="scoresheetModeControls" role="group" aria-label="Edit remarks">
                            {scoresheetMode === "view" ? <button type="button" className="scoresheetModeButton" disabled={classReadonly} onClick={() => setScoresheetMode("edit")}>Edit Remarks</button> : <>
                              <button type="button" className="secondaryButton" disabled={savingScoresheet} onClick={() => scoresheetDirty ? requestScoresheetNavigation(() => setScoresheetMode("view")) : setScoresheetMode("view")}>Cancel</button>
                              <button type="button" className="toolbarButton scoresheetSaveButton" disabled={!scoresheetDirty || savingScoresheet || Boolean(deletingProgress)} onClick={() => void saveScoresheetChanges()}>{savingScoresheet ? "Saving..." : "Save Remarks"}</button>
                            </>}
                          </div>}
                        </div>
                        {/*
                          * The scoresheet is drawn as the workbook prints it: the
                          * same rows, the same merges and the same headings, in
                          * one continuous grid. Every label below is the text
                          * the exported sheet carries, so a record can be read
                          * against the paper form cell for cell.
                          */}
                        <div
                          className="scoresheetScroller"
                          role="region"
                          aria-label="English reading assessment scoresheet"
                          tabIndex={0}
                        >
                          <table
                            className="scoresheetGrid"
                            style={{ "--scoresheet-zoom": scoresheetZoom }}
                          >
                            <colgroup>
                              {SCORESHEET_GRID_WIDTHS.map((width, index) => (
                                <col key={index} style={{ width: `${width}px` }} />
                              ))}
                            </colgroup>

                            <tbody>
                              <tr className="ssAssessmentRow">
                                <th colSpan={2} scope="row" className="ssLabel">
                                  ASSESSMENT TYPE
                                </th>
                                <td className="ssValue">{currentPeriod}</td>
                                <td colSpan={18} className="ssEmpty">
                                  <span className="ssWorkbookTitle">
                                    GRADE 3 English Reading Assessment Scoresheet
                                  </span>
                                </td>
                              </tr>

                              <tr>
                                <th colSpan={2} scope="row" className="ssLabel">
                                  School ID:
                                </th>
                                <td className="ssValue">{user?.school_id || ""}</td>
                                <th colSpan={2} scope="row" className="ssLabel">
                                  Total Enrolment
                                </th>
                                <td className="ssValue ssNumber">
                                  {scoresheetHeader.total.enrolled}
                                </td>
                                <th scope="row" className="ssLabel">
                                  Assessed :
                                </th>
                                <td className="ssValue ssNumber">
                                  {scoresheetHeader.total.assessed}
                                </td>
                                <td colSpan={13} className="ssEmpty" />
                              </tr>

                              <tr>
                                <th colSpan={2} scope="row" className="ssLabel">
                                  School Name:
                                </th>
                                <td className="ssValue">{user?.school_name || ""}</td>
                                <th scope="row" className="ssLabel">
                                  Male
                                </th>
                                <th scope="row" className="ssLabel">
                                  Female
                                </th>
                                <th colSpan={3} rowSpan={2} className="ssGroupHead">
                                  Assessment Part 1 (Word Recognition)
                                </th>
                                <th rowSpan={5} className="ssLegend">
                                  WORD SCORE 0 - Full Refresher 1 to 10 –
                                  Moderate Refresher 11 to 16 – Light Refresher
                                  17 to 20 – Grade Ready
                                </th>
                                <th colSpan={6} rowSpan={2} className="ssGroupHead">
                                  Assessment Part 2 (Reading Fluency and
                                  Comprehension)
                                </th>
                                <td className="ssEmpty" />
                                <td className="ssEmpty" />
                                <td className="ssEmpty" />
                                <td className="ssEmpty" />
                                <td className="ssEmpty" />
                                <td className="ssEmpty" />
                              </tr>

                              <tr>
                                <th colSpan={2} scope="row" className="ssLabel">
                                  Teacher:
                                </th>
                                <td className="ssValue">{user?.full_name || ""}</td>
                                <td className="ssValue ssNumber">
                                  {scoresheetHeader.male.enrolled}
                                </td>
                                <td className="ssValue ssNumber">
                                  {scoresheetHeader.female.enrolled}
                                </td>
                                <td colSpan={6} rowSpan={4} className="ssReference">
                                  <img
                                    src="/templates/scoresheet-reading-levels.png"
                                    alt="Reading level criteria and observation reference"
                                  />
                                </td>
                              </tr>

                              <tr>
                                <th colSpan={2} scope="row" className="ssLabel">
                                  Grade:
                                </th>
                                <td className="ssValue">Grade 3</td>
                                <th rowSpan={3} className="ssNote">
                                  Enter Male or Female
                                </th>
                                <th rowSpan={3} className="ssNote">
                                  Enter date of assessment (mm/dd/yy)
                                </th>
                                <th rowSpan={3} className="ssNote">
                                  Task 1 – Write the number of letters sounded
                                  out correctly
                                </th>
                                <th rowSpan={3} className="ssNote">
                                  Words (Task 2) If task 1 score is 1 to 10
                                </th>
                                <th rowSpan={3} className="ssNote">
                                  Total Score = Task 1 Score + Task 2 Score
                                </th>
                                <th rowSpan={3} className="ssNote">
                                  Story Number 1 or 2
                                </th>
                                <th rowSpan={3} className="ssNote">
                                  Total Reading Miscues
                                </th>
                                <th rowSpan={3} className="ssNote">
                                  Number of words read within 2 mins
                                </th>
                                <th colSpan={2} rowSpan={3} className="ssNote">
                                  Total Time Used in Reading (Max : 2 Mins)
                                </th>
                                <th rowSpan={3} className="ssNote">
                                  Number of Words per Minute (WPM)
                                </th>
                              </tr>

                              <tr>
                                <th colSpan={2} scope="row" className="ssLabel">
                                  Section:
                                </th>
                                <td className="ssValue">{selectedClass?.name || ""}</td>
                              </tr>

                              <tr>
                                <th colSpan={2} scope="row" className="ssLabel">
                                  Language:
                                </th>
                                <td className="ssValue">English</td>
                              </tr>

                              <tr className="ssColumnRow">
                                <th scope="col">S/N</th>
                                <th scope="col">LRN</th>
                                <th scope="col">Name of Learner</th>
                                <th scope="col">Sex</th>
                                <th scope="col">Date of Assessment</th>
                                <th scope="col">Task 1 (10)</th>
                                <th scope="col">Words (10)</th>
                                <th scope="col">Total Score</th>
                                <th scope="col">Part 1 Reading Level</th>
                                <th scope="col">Story Number</th>
                                <th scope="col">Number of Miscue</th>
                                <th scope="col">Words Read</th>
                                <th colSpan={2} scope="col" className="ssTimeHeader">
                                  <span className="ssTimeHeaderLayout">
                                    <span>Total</span>
                                    <span className="ssTimeHeaderParts">
                                      <span>Mins</span>
                                      <span>Secs</span>
                                    </span>
                                  </span>
                                </th>
                                <th scope="col">WPM</th>
                                <th scope="col">Reading %</th>
                                <th scope="col">Total Correct Answer</th>
                                <th scope="col">Learner Experience (Rating 1-5)</th>
                                <th scope="col">Observation Level</th>
                                <th scope="col">READING PROFILE</th>
                                <th scope="col">Remarks</th>
                              </tr>

                              {currentRecords.length === 0 ? (
                                <tr>
                                  <td colSpan={21}>
                                    <div className="emptyState">
                                      <div className="emptyIcon">▤</div>

                                      <h3>No records for {currentPeriod}</h3>

                                      <p>
                                        Completed assessments will appear here
                                        after they are saved to the database.
                                      </p>
                                    </div>
                                  </td>
                                </tr>
                              ) : (
                                currentRecords.map(({ assessment, learner }, index) => {
                                  const done = Boolean(assessment.is_completed);
                                  const total = Number(assessment.task1_score || 0) + Number(assessment.task2_score || 0);
                                  const part1 = !done ? "" : total <= 0 ? "Full Refresher" : total <= 10 ? "Moderate Refresher" : total <= 16 ? "Light Refresher" : "Grade Ready";
                                  const passage = done && hasRecordedPassageAssessment(assessment);
                                  const seconds = Number(assessment.timer_seconds || 0);
                                  const profile = done ? getRecordProfile(assessment) : "";
                                  const cells = [learner.lrn, formatName(learner), learner.sex,
                                    done && assessment.date_administered ? new Date(assessment.date_administered).toLocaleDateString() : "",
                                    done ? assessment.task1_score ?? 0 : "", done ? assessment.task2_score ?? 0 : "", done ? total : "", part1,
                                    passage ? assessment.story_number ?? "" : "", passage ? assessment.total_miscues ?? 0 : "", passage ? getRecordWordsRead(assessment) : "",
                                    passage ? Math.floor(Math.min(120,Math.max(0,Math.round(seconds))) / 60) : "", passage ? Math.min(120,Math.max(0,Math.round(seconds))) % 60 : "", passage ? assessment.wpm ?? "" : "",
                                    passage ? `${Math.round(Number(assessment.miscue_accuracy || 0))}%` : "", passage ? assessment.comprehension_score ?? 0 : "",
                                    passage ? assessment.experience_rating ?? "" : "", done ? assessment.observation_level ?? "" : "", profile];
                                  return <tr key={assessment.id}><td className="ssData ssNumber">{index + 1}</td>{cells.map((value,column)=><td key={column} className={`ssData ${column===0||column===1?"ssText":"ssCentered"} ${[7,18].includes(column)?`ssLevel ${profileClass(String(value))}`:""}`}>{value}</td>)}<td className="ssData ssCentered">{!readOnly && scoresheetMode === "edit" && done ? <input className="scoresheetInput scoresheetTextInput" type="text" maxLength={5000} value={scoresheetValue(assessment,"remarks")||""} aria-label={`Remarks for ${formatName(learner)}`} onChange={event=>updateScoresheetDraft(assessment,"remarks",event.target.value)} /> : assessment.remarks || ""}</td></tr>;
                                })
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}</div>;}
