"use client";
import {useEffect,useRef,useState} from 'react';
import {downloadBlob} from '../lib/downloadFile';
import WorkspaceLoading from './WorkspaceLoading';
import {getStoryQuestions} from '../lib/storyComprehension.mjs';
import {getPossibleStoryAnswer} from '../lib/storyAnswerGuides.mjs';
import {formatName,getRecordProfile,hasRecordedPassageAssessment,READING_PROFILE_LABELS} from '../lib/recordViewModel.mjs';
import {COMPARISON_OPTIONS,profileComparisonData,profileCountScale} from '../lib/profileComparison.mjs';
import {printAssessmentElement,CLEAN_PRINT_HINT} from '../lib/printRecords';
import {canPrintIndividualResult,buildIndividualLearnerReport,createIndividualLearnerReport,INDIVIDUAL_REPORT_PRINT_CSS} from '../lib/individualLearnerReport.mjs';
import {countLearnerMiscues, learnerPeriodProfile, learnerPeriodStatus} from '../lib/learnerPeriodResults.mjs';
import './AssessmentResults.css';
const PERIODS=["BoSY","MoSY","EoSY"];
const PERIOD_MEANINGS = {
  BoSY: "Beginning of School Year",
  MoSY: "Middle of School Year",
  EoSY: "End of School Year",
};
const READING_PROFILE_COLORS = {
  "Low Emerging Reader": "#9b2e22",
  "High Emerging Reader": "#c0392b",
  "Developing Reader": "#a9762f",
  "Transitioning Reader": "#1a2b4c",
  "Reading At Grade Level": "#3e7a5e",
};const ANALYTICS_REVIEW_QUESTIONS = {
  para: [
    "What must Para look for?",
    "What time or part of the day is it?",
    "What does Para land on?",
    "Who does Para see?",
    "What else is the police officer doing besides directing traffic?",
    "What could the police officer be feeling?",
  ],
  fields: [
    "What is the job of Dulnuwan?",
    "When do Ali and Dina help Dulnuwan and Bugan?",
    "Where do they rest?",
    "Why do they rest?",
    "What kind of weather or day is it?",
    "What does Dulnuwan pick up?",
  ],
};
function analyticsQuestionsForStory(title) {
  return getStoryQuestions({title}).map(question=>question.text);
}

function formatAnalyticsMiscueType(value) {
  const type = String(value || "Miscue").trim();
  return type === "SelfCorrection"
    ? "Self-correction"
    : type.replace(/([a-z])([A-Z])/g, "$1 $2");
}

const ANALYTICS_MISCUE_PALETTE = {
  Insertion: ["#edf1f7", "#1a2b4c", "#7f9dc4", "#20314b", "#c5d8f6"],
  Reversion: ["#f1eafa", "#663399", "#a17ac5", "#352447", "#ddc3f7"],
  Omission: ["#f7e6e3", "#8a1515", "#c96c62", "#3a2325", "#f1b9b3"],
  Substitution: ["#f5ede0", "#835b24", "#bf9657", "#3b3021", "#f2d09d"],
  Repetition: ["#e4f3f5", "#176270", "#5d9faa", "#1b343a", "#a8dfe7"],
  "Self-correction": ["#e8f0ea", "#2f5f49", "#6c9b80", "#21382d", "#b7e2c9"],
};

function analyticsMiscueStyle(type) {
  const key = Object.keys(ANALYTICS_MISCUE_PALETTE).find(
    (label) => label.replace(/[^a-z]/gi, "").toLowerCase() ===
      String(type).replace(/[^a-z]/gi, "").toLowerCase()
  );
  const [background, color, border, darkBackground, darkColor] =
    ANALYTICS_MISCUE_PALETTE[key] || ["#edf1f7", "#35455c", "#8895a8", "#293343", "#d3dae5"];
  return {
    "--miscue-bg": background,
    "--miscue-ink": color,
    "--miscue-border": border,
    "--miscue-dark-bg": darkBackground,
    "--miscue-dark-ink": darkColor,
  };
}

function AnalyticsPeriodBars({ period, mode, maxCount }) {
  return (
    <div className="analyticsBarCluster">
      {period.profiles.map((profile) => {
        const value = mode === "percent" ? profile.percent : profile.count;
        const height = mode === "percent"
          ? profile.percent
          : (profile.count / Math.max(1, maxCount)) * 100;
        const style = {
          "--bar-height": `${Math.max(profile.count ? 4 : 0, height)}%`,
        };
        const contents = (
          <>
            <span className="analyticsBarValue">{mode === "percent" ? `${value}%` : value}</span>
            <span
              className="analytics2dBar"
              style={{
                "--bar-color": readingProfileColor(profile.label),
              }}
            />
          </>
        );

        return <div key={profile.label} className="analyticsBarButton analyticsBarStatic" style={style} aria-label={`${period.period}, ${profile.label}: ${profile.count} learners, ${profile.percent}%`}>{contents}</div>;
      })}
    </div>
  );
}

function readingProfileColor(label) {
  const token = {
    "Low Emerging Reader": "low", "High Emerging Reader": "high",
    "Developing Reader": "developing", "Transitioning Reader": "transitioning",
    "Reading At Grade Level": "grade",
  }[label];
  const fallback = READING_PROFILE_COLORS[label] || "#1a2b4c";
  return token ? `var(--crl-profile-${token}, ${fallback})` : fallback;
}

function AnalyticsChartScale({ mode, maxCount }) {
  const ticks=mode==="percent"?[100,75,50,25,0]:profileCountScale(maxCount).ticks.slice().reverse();
  return (
    <div className="analyticsChartScale" aria-hidden="true">
      {ticks.map((tick) => (
        <span key={tick}>
          {mode === "percent" ? `${tick}%` : tick}
        </span>
      ))}
    </div>
  );
}

export function ReadingProfileProgressChart({
  periods,
  mode,
  onModeChange,
  focus,
  onFocus,
  onExpand,
  singleGraph = false,
  selection = 'all',
  onSelectionChange,
}) {
  const selectedNames = profileComparisonData(periods, selection).selected.map(p => p.period);
  const chartPeriods = Array.isArray(periods) ? periods : [];
  const visiblePeriods = chartPeriods.filter(period => selectedNames.includes(period.period) && (!focus || period.period === focus));
  const maxCount = profileComparisonData(visiblePeriods).max;

  return (
    <section
      aria-label="Reading Profile Progress"
      className={`analyticsProgressPanel${focus ? " isPeriodFocused" : ""}${singleGraph ? " analyticsSingleGraph" : ""}`}
      onClick={() => {
        if (focus) onFocus(null);
      }}
    >
      <div className="analyticsSectionHead">
        <div className="analyticsChartHeading">
          <h3>Reading Profile Progress</h3>
          {focus ? <span>{focus} focus</span> : null}
          <p>{singleGraph ? "All sections in this school year. Press a period chart to enlarge." : "Press a period chart to enlarge."}</p>
        </div>
        <div className="analyticsModeSwitch" aria-label="Chart values">
          {["percent", "count"].map((option) => (
            <button
              type="button"
              key={option}
              className={mode === option ? "active" : ""}
              aria-pressed={mode === option}
              onClick={() => onModeChange(option)}
            >
              {option === "percent" ? "%" : "No."}
            </button>
          ))}
        </div>
      </div>

      <div className="analyticsProgressTools">
        <div className="analyticsComparisonSwitch" role="group" aria-label="Timelines to compare">
          {COMPARISON_OPTIONS.map(option => <button type="button" key={option.value} className={(COMPARISON_OPTIONS.some(o=>o.value===selection)?selection:'all')===option.value?'active':''} aria-pressed={(COMPARISON_OPTIONS.some(o=>o.value===selection)?selection:'all')===option.value} onClick={event=>{event.stopPropagation();onFocus?.(null);onSelectionChange?.(option.value);}}>{option.label}</button>)}
        </div>
        <p>Compare reading profiles across timelines. Unassessed timelines have no results yet.</p>
      </div>
      <div className="analyticsChartScroller analyticsDesktopChart" tabIndex={0} role="region" aria-label="Reading profile graph by assessment period">
        <div className="analyticsChartCanvas">
          <AnalyticsChartScale mode={mode} maxCount={maxCount} />
          <div className={`analyticsChartPeriods${focus ? " zoomed" : ""}`} style={{gridTemplateColumns:`repeat(${visiblePeriods.length || 1}, minmax(230px, 1fr))`}}>
            {visiblePeriods.map((period) => (
              <div className={`analyticsPeriodGroup${focus ? " focused" : ""}`} key={period.period}
                role={period.total>0?'button':'group'} tabIndex={period.total>0?0:undefined}
                aria-label={period.total>0?`Enlarge ${period.period}, ${PERIOD_MEANINGS[period.period]} chart`:`${period.period}: Not assessed yet`}
                aria-haspopup={period.total>0?'dialog':undefined}
                onClick={event=>{event.stopPropagation();if(period.total>0)onExpand(period.period);}}
                onKeyDown={event=>{if(period.total>0&&(event.key==='Enter'||event.key===' ')){event.preventDefault();event.stopPropagation();onExpand(period.period);}}}>
                {period.total>0?<AnalyticsPeriodBars
                  period={period}
                  mode={mode}
                  maxCount={maxCount}
                />:<div className="analyticsUnassessed" role="status">Not assessed yet</div>}
                <strong>{period.period}</strong>
                <small>{PERIOD_MEANINGS[period.period]}</small>
                <span>{period.total} assessed</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="analyticsMobileChartStack">
        {visiblePeriods.map((period) => (
          <div
            className="analyticsMobilePeriodCard"
            key={period.period}
            onClick={(event) => {
              event.stopPropagation();
              if(period.total>0) onExpand(period.period);
            }}
            onKeyDown={(event) => {
              if (period.total>0 && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                onExpand(period.period);
              }
            }}
            role={period.total>0?"button":"group"}
            tabIndex={period.total>0?0:undefined}
            aria-label={period.total>0?`Enlarge ${period.period}, ${PERIOD_MEANINGS[period.period]} chart`:`${period.period}: Not assessed yet`}
            aria-haspopup={period.total>0?"dialog":undefined}
          >
            <span className="analyticsMobilePeriodHead">
              <span>
                <strong>{period.period}</strong>
                <small>{PERIOD_MEANINGS[period.period]}</small>
              </span>
              <em>{period.total} assessed</em>
            </span>
            <div className="analyticsMobileChartPlot">
              <AnalyticsChartScale mode={mode} maxCount={maxCount} />
              {period.total>0?<AnalyticsPeriodBars period={period} mode={mode} maxCount={maxCount} />:<div className="analyticsUnassessed" role="status">Not assessed yet</div>}
            </div>
            {period.total>0&&<span className="analyticsMobileChartAction">Press chart to enlarge</span>}
          </div>
        ))}
      </div>

      <div className="analyticsLegend">
        {READING_PROFILE_LABELS.map((label) => (
          <span key={label}>
            <span style={{ background: readingProfileColor(label) }} />
            {label}
          </span>
        ))}
      </div>
      <div className="analyticsComparisonTableWrap" tabIndex={0} role="region" aria-label="Reading profile comparison values"><table className="analyticsComparisonTable"><thead><tr><th>Reading profile</th>{profileComparisonData(chartPeriods,selection).selected.map(row=><th key={row.period}>{row.period}</th>)}</tr></thead><tbody>{profileComparisonData(chartPeriods,selection).rows.map(row=><tr key={row.label}><th scope="row">{row.label}</th>{row.values.map(value=><td key={value.period}>{value.assessed?value.count:'Not assessed'}</td>)}</tr>)}</tbody></table></div>
    </section>
  );
}

export function AnalyticsPeriodChartDialog({ period, periods, mode, onClose }) {
  const dialogRef = useRef(null);
  const previousFocusRef = useRef(typeof document !== "undefined" ? document.activeElement : null);
  useEffect(() => {
    const previousFocus = previousFocusRef.current;
    const dialog = dialogRef.current;
    const trapFocus = (event) => {
      if (event.key !== "Tab" || !dialog) return;
      const controls = dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex="0"]');
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog?.addEventListener("keydown", trapFocus);
    return () => {
      dialog?.removeEventListener("keydown", trapFocus);
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);
  if (!period) return null;
  const maxCount = profileCountScale(Math.max(
    1,
    ...(Array.isArray(periods) ? periods : []).flatMap((item) =>
      item.profiles.map((profile) => profile.count)
    )
  )).max;

  return (
    <div
      className="analyticsChartOverlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="analyticsChartDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="analytics-chart-dialog-title"
      >
        <header className="analyticsChartDialogHead">
          <div>
            <strong id="analytics-chart-dialog-title">{period.period}</strong>
            <span>{PERIOD_MEANINGS[period.period]}</span>
          </div>
          <button type="button" autoFocus onClick={onClose} aria-label="Close enlarged chart">×</button>
        </header>
        <div className="analyticsChartDialogBody">
          <div className="analyticsEnlargedChartPlot">
            <AnalyticsChartScale mode={mode} maxCount={maxCount} />
            <AnalyticsPeriodBars period={period} mode={mode} maxCount={maxCount} />
          </div>
          <div className="analyticsChartDialogTotal">{period.total} assessed</div>
          <div className="analyticsLegend analyticsDialogLegend">
            {READING_PROFILE_LABELS.map((label) => (
              <span key={label}>
                <span style={{ background: readingProfileColor(label) }} />
                {label}
              </span>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function AnalyticsEvidenceList({ title, rows, emptyText }) {
  const items = Array.isArray(rows) ? rows : [];
  return (
    <section className="analyticsEvidenceBlock">
      <h4>{title}</h4>
      {items.length ? (
        <div className="analyticsEvidenceItems">
          {items.map((item, index) => (
            <div className={`analyticsEvidenceItem ${item.correct ? "correct" : "incorrect"}`} key={item.id ?? `${title}-${index}`}>
              <span>
                {item.label}
                {item.possibleAnswer && <small className="analyticsPossibleAnswer">Possible answer: {item.possibleAnswer}</small>}
              </span>
              <strong>{item.correct ? "Correct" : "Incorrect"}</strong>
            </div>
          ))}
        </div>
      ) : <div className="analyticsEvidenceEmpty">{emptyText || "No recorded items."}</div>}
    </section>
  );
}

function LearnerAssessmentEvidence({ detail }) {
  if (!detail) return null;
  const letterRows = (detail.letter_results || detail.task1_results || []).map((item, index) => ({
    id: item.id ?? `letter-${index}`,
    label: item.letter ?? item.content ?? item.item ?? `Letter ${index + 1}`,
    correct: Boolean(item.is_correct ?? item.isCorrect ?? item.correct),
  }));
  const wordRows = (detail.word_results || detail.task2_results || []).map((item, index) => ({
    id: item.id ?? `word-${index}`,
    label: item.word ?? item.content ?? item.item ?? `Word ${index + 1}`,
    correct: Boolean(item.is_correct ?? item.isCorrect ?? item.correct),
  }));
  const questionGuides = Array.isArray(detail.story_questions) ? detail.story_questions : [];
  const questions = questionGuides.length ? questionGuides.map(question => question.text) : analyticsQuestionsForStory(detail.story_title);
  const comprehensionRows = (detail.comprehension_results || []).map((item, index) => ({
    id: item.id ?? `question-${index}`,
    label: item.question || questions[Number(item.question_index ?? item.questionIndex ?? item.index ?? index)] || `Question ${index + 1}`,
    possibleAnswer: item.possible_answer || questionGuides[Number(item.question_index ?? item.questionIndex ?? item.index ?? index)]?.possibleAnswer || getPossibleStoryAnswer(item.question || questions[Number(item.question_index ?? item.questionIndex ?? item.index ?? index)]),
    correct: Boolean(item.is_correct ?? item.isCorrect ?? item.correct),
  }));
  const miscues = detail.passage_miscues || [];
  const passageWords = String(detail.story_text || "").trim().split(/\s+/).filter(Boolean);
  const normalizedMiscues = miscues
    .map((item, index) => {
      const wordIndex = Number(item.word_index ?? item.wordIndex ?? item.index);
      const hasIndex = Number.isInteger(wordIndex) && wordIndex >= 0;
      const originalWord = hasIndex && passageWords[wordIndex]
        ? passageWords[wordIndex]
        : item.word || item.original_word || `Word ${hasIndex ? wordIndex + 1 : index + 1}`;
      return {
        id: item.id ?? `miscue-${index}`,
        wordIndex: hasIndex ? wordIndex : null,
        originalWord,
        type: formatAnalyticsMiscueType(item.miscue_type ?? item.miscueType ?? item.type),
        misreadWord: String(item.misread_word ?? item.misreadWord ?? "").trim(),
      };
    })
    .sort((left, right) => (left.wordIndex ?? Number.MAX_SAFE_INTEGER) - (right.wordIndex ?? Number.MAX_SAFE_INTEGER));
  const miscuesByIndex = normalizedMiscues.reduce((map, item) => {
    if (item.wordIndex === null) return map;
    const current = map.get(item.wordIndex) || [];
    current.push(item);
    map.set(item.wordIndex, current);
    return map;
  }, new Map());
  const recordedTimerSeconds = detail.timer_seconds ?? detail.timerSeconds;
  const passageWasAdministered =
    recordedTimerSeconds !== null &&
    recordedTimerSeconds !== undefined &&
    Number.isFinite(Number(recordedTimerSeconds));
  const timeLimitReached = passageWasAdministered && Number(recordedTimerSeconds) >= 120;
  const trailingOmissions = new Set(
    normalizedMiscues
      .filter((item) => item.type === "Omission" && item.wordIndex !== null)
      .map((item) => item.wordIndex)
  );
  let lastWordNumber = passageWasAdministered ? passageWords.length : 0;
  if (timeLimitReached) {
    while (lastWordNumber > 0 && trailingOmissions.has(lastWordNumber - 1)) {
      lastWordNumber -= 1;
    }
  }
  const recordedWordsRead = Number(detail.words_read ?? detail.wordsRead);
  if (passageWasAdministered && !passageWords.length && Number.isFinite(recordedWordsRead)) {
    lastWordNumber = Math.max(0, Math.round(recordedWordsRead));
  }
  const lastWordRead = passageWords[lastWordNumber - 1] || "";

  return (
    <div className="analyticsEvidence">
      <div className="analyticsEvidenceSummary">
        <div><span>Profile</span><strong>{getRecordProfile(detail)}</strong></div>
        <div><span>Letters</span><strong>{Number(detail.task1_score || 0)}/10</strong></div>
        <div><span>Words</span><strong>{Number(detail.task2_score || 0)}/10</strong></div>
        <div><span>Comprehension</span><strong>{Number(detail.comprehension_score || 0)}/6</strong></div>
      </div>
      <div className="analyticsEvidenceGrid">
        <AnalyticsEvidenceList title="Letters" rows={letterRows} />
        <AnalyticsEvidenceList title="Words" rows={wordRows} />
        <AnalyticsEvidenceList title="Comprehension" rows={comprehensionRows} />
        <section className="analyticsEvidenceBlock analyticsPassageEvidence">
          <h4>Reading Miscues</h4>
          <div className="analyticsMiscueLegend" aria-label="Reading miscue color key">
            {Object.keys(ANALYTICS_MISCUE_PALETTE).map((type) => (
              <span key={type} style={analyticsMiscueStyle(type)}>{type}</span>
            ))}
          </div>
          {lastWordNumber > 0 ? (
            <div className="analyticsLastWordRead">
              <span>Last word read</span>
              <strong>{lastWordRead || `Word ${lastWordNumber}`}</strong>
              <small>Word {lastWordNumber}{passageWords.length ? ` of ${passageWords.length}` : ""}</small>
            </div>
          ) : null}
          {passageWords.length ? (
            <p className="analyticsPassageText">
              {passageWords.map((word, index) => {
                const wordMiscues = miscuesByIndex.get(index) || [];
                const types = wordMiscues.map((item) => item.type).join(", ");
                return (
                  <span
                    key={`${word}-${index}`}
                    className={wordMiscues.length ? "miscued" : ""}
                    style={wordMiscues.length ? analyticsMiscueStyle(wordMiscues[0].type) : undefined}
                    title={types || undefined}
                  >
                    {word}{" "}
                  </span>
                );
              })}
            </p>
          ) : null}
          {normalizedMiscues.length ? (
            <div className="analyticsMiscueLedger" aria-label="Recorded reading miscues">
              {normalizedMiscues.map((item) => (
                <div className="analyticsMiscueRow" key={item.id} style={analyticsMiscueStyle(item.type)}>
                  <div>
                    <strong>{item.originalWord}</strong>
                    <small>{item.wordIndex === null ? "Recorded word" : `Word ${item.wordIndex + 1}`}</small>
                  </div>
                  <span>{item.type}</span>
                  {item.misreadWord ? <small>Read as “{item.misreadWord}”</small> : null}
                </div>
              ))}
            </div>
          ) : <div className="analyticsEvidenceEmpty">{Array.isArray(detail.passage_miscues) ? "No miscues recorded." : "Miscue details unavailable."}</div>}
        </section>
      </div>
    </div>
  );
}

function LearnerComparisonTable({ title, rows }) {
  return (
    <div className="learnerComparisonScroll" role="region" aria-label={title} tabIndex={0}>
      <table className="learnerComparisonTable">
        <caption>{title}</caption>
        <thead>
          <tr><th scope="col">Measure</th>{PERIODS.map(period => <th scope="col" key={period}>{period}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map(([label, ...values]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              {values.map((value, index) => <td key={PERIODS[index]}>{value}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LearnerPeriodSummary({ periodResults }) {
  const entries = PERIODS.map(period => periodResults.find(entry => entry.period === period) || {});
  const compared = entries.map(({ result, detail, loading }) => {
    if (!result?.is_completed) return { result };
    const saved = { ...result, ...detail };
    return { result, saved, passage: hasRecordedPassageAssessment(saved), miscues: countLearnerMiscues(saved), loading };
  });
  const score = (value, maximum) => value == null ? "Not recorded" : `${value}/${maximum}`;
  const measure = value => value ?? "Not recorded";
  const passageMeasure = read => ({ passage, saved }) => passage ? read(saved) : "Not administered";
  const metrics = [
    ["Letter sounds", ({ saved }) => score(saved.task1_score, 10)],
    ["Word reading", ({ saved }) => (
      Number(saved.task1_score) > 0 || (saved.word_results ?? saved.task2_results)?.length
        ? score(saved.task2_score, 10) : "Not administered"
    )],
    ["Comprehension", passageMeasure(saved => score(saved.comprehension_score, 6))],
    ["Passage", passageMeasure(saved => measure(saved.story_title))],
    ["Correct words read", passageMeasure(saved => measure(saved.words_read))],
    ["Reading accuracy", passageMeasure(saved => saved.miscue_accuracy == null ? "Not recorded" : `${Number(saved.miscue_accuracy).toFixed(1)}%`)],
    ["Correct words per minute", passageMeasure(saved => (
      saved.words_read != null && Number(saved.timer_seconds) > 0
        ? ((Number(saved.words_read) / Number(saved.timer_seconds)) * 60).toFixed(2)
        : "Not recorded"
    ))],
    ["Reading time", passageMeasure(saved => `${saved.timer_seconds} sec`)],
    ["Total scored miscues", passageMeasure(saved => measure(saved.total_miscues))],
  ];
  const detailKeys = new Map(Object.keys(ANALYTICS_MISCUE_PALETTE).map(label => [label.toLowerCase().replace(/[^a-z]/g, ""), label]));
  const hasOtherMiscues = compared.some(({ miscues }) => miscues && [...miscues.keys()].some(key => !detailKeys.has(key)));
  const miscueRows = [...detailKeys].map(([key, label]) => [label, counts => counts.get(key) || 0]);
  if (hasOtherMiscues) {
    miscueRows.push(["Other miscues", counts =>
      [...counts].reduce((sum, [key, count]) => sum + (detailKeys.has(key) ? 0 : count), 0)]);
  }
  const hasPassage = compared.some(entry => entry.passage);
  return (
    <div className="learnerPeriodSummary">
      <LearnerComparisonTable title="Reading performance by period" rows={[
        ["Assessment status", ...compared.map(({ result }) => learnerPeriodStatus(result))],
        ["Reading profile", ...compared.map(({ result }) => learnerPeriodProfile(result) || "—")],
        ...metrics.map(([label, read]) => [label, ...compared.map(entry => entry.saved ? read(entry) : "—")]),
      ]} />
      {hasPassage && <LearnerComparisonTable title="Miscues by type" rows={miscueRows.map(([label, read]) => [
        label,
        ...compared.map(({ saved, passage, miscues, loading }) => {
          if (!saved) return "—";
          if (!passage) return "Not administered";
          if (loading) return "Loading…";
          return miscues ? read(miscues) : "Details unavailable";
        }),
      ])} />}
    </div>
  );
}

export function AnalyticsLearnerResultPanel({
  selectedLearner,
  periodResults,
  period,
  onPeriodChange,
  initialSummary = false,
  loading: loadingLearner,
  error: learnerError,
  section,
  year,
  teacher,
  onPrintError,
}) {
  const [summary, setSummary] = useState(initialSummary);
  const selected = periodResults.find(entry => entry.period === period);
  const result = selected?.result;
  const selectedAssessment = result?.is_completed ? result : null;
  const detail = selected?.detail;
  const loading = loadingLearner || selected?.loading;
  const error = learnerError || selected?.error;
  const printContext = {learner:selectedLearner,assessment:selectedAssessment,detail,section,year,teacher,period,loading,error};
  const [exportingIndividual,setExportingIndividual]=useState(false),individualExportGeneration=useRef(0);
  useEffect(()=>{individualExportGeneration.current++;setExportingIndividual(false);return()=>{individualExportGeneration.current++;};},[selectedLearner?.id,selectedAssessment?.id,period,section?.id,year?.id,teacher?.id]);
  const printReady = canPrintIndividualResult(printContext);
  const exportIndividualResult=async()=>{
    if(!printReady||exportingIndividual)return;const generation=++individualExportGeneration.current;setExportingIndividual(true);
    try{const {buildIndividualSummaryWorkbook}=await import('../lib/individualSummaryExport');const result=await buildIndividualSummaryWorkbook(printContext);if(generation===individualExportGeneration.current)downloadBlob(result.blob,result.filename);}
    catch(error){if(generation===individualExportGeneration.current)onPrintError?.(error.message||'Unable to export this result.');}
    finally{if(generation===individualExportGeneration.current)setExportingIndividual(false);}
  };
  const printIndividualResult = () => {
    try {
      const report = buildIndividualLearnerReport(printContext);
      printAssessmentElement(createIndividualLearnerReport(document,report), `CRLA ${period} - ${report.learnerName}`, {
        orientation:'landscape',css:INDIVIDUAL_REPORT_PRINT_CSS,showTitle:false,
        onError:()=>onPrintError?.('Unable to open the print dialog. Please try again.'),
      });
    } catch (error) { onPrintError?.(error.message || 'Unable to print this result.'); }
  };
  return (
    <div className="analyticsLearnerResult">
      <div className="analyticsResultHeader learnerResultHeader">
        <div>
          <span>Learner</span>
          <strong>{selectedLearner ? formatName(selectedLearner) : "Learner results"}</strong>
          {selectedLearner && (
            <small>{[selectedLearner.lrn && `LRN ${selectedLearner.lrn}`, selectedLearner.sex, section?.name, year?.label].filter(Boolean).join(" · ")}</small>
          )}
        </div>
        <div className="analyticsPeriodSwitch" role="group" aria-label="Learner result view">
          <button type="button" className={summary ? "active" : ""} aria-pressed={summary} onClick={() => setSummary(true)}>Summary</button>
          {PERIODS.map(assessmentPeriod => {
            const active = !summary && period === assessmentPeriod;
            return (
              <button
                type="button"
                key={assessmentPeriod}
                className={active ? "active" : ""}
                aria-pressed={active}
                onClick={() => { setSummary(false); onPeriodChange(assessmentPeriod); }}
              >
                {assessmentPeriod}
              </button>
            );
          })}
        </div>
      </div>

      {!summary && selectedAssessment && <div className="analyticsIndividualPrint">
        <button type="button" className="toolbarButton individualPrintButton" disabled={!printReady} onClick={printIndividualResult}>Print individual summary</button>
        <button type="button" className="toolbarButton individualExportButton" disabled={!printReady||exportingIndividual} onClick={exportIndividualResult}>{exportingIndividual?'Please wait…':'Export individual summary'}</button>
        <small>{printReady ? `Print the selected ${period} result with a teacher signature area. ${CLEAN_PRINT_HINT}` : 'A complete saved result is required to print.'}</small>
      </div>}
      <div className="analyticsResultBody">
        {loadingLearner ? (
          <WorkspaceLoading label="Loading learner result…" variant="result"/>
        ) : learnerError ? (
          <div className="analyticsDetailState error" role="alert">{learnerError}</div>
        ) : !selectedLearner ? (
          <div className="analyticsDetailState">Select a learner result.</div>
        ) : summary ? (
          <LearnerPeriodSummary periodResults={periodResults} />
        ) : (
          <>
            <div className="learnerPeriodHeading">
              <h3>{PERIOD_MEANINGS[period]}</h3>
              <span>{learnerPeriodStatus(result)}</span>
              {selectedAssessment && <strong>{learnerPeriodProfile(result)}</strong>}
            </div>
            {loading ? (
              <WorkspaceLoading label="Loading learner result…" variant="result"/>
            ) : error ? (
              <div className="analyticsDetailState error" role="alert">{error}</div>
            ) : !selectedAssessment ? (
              <div className="analyticsDetailState">No completed assessment for this period.</div>
            ) : (
              <LearnerAssessmentEvidence detail={{ ...selectedAssessment, ...detail }} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
