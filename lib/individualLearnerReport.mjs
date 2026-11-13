import { getRecordProfile, hasRecordedPassageAssessment } from './recordViewModel.mjs';
import { passageCutoffMarker } from './passageCutoff.mjs';

const PERIOD_NAMES = { BoSY: 'Beginning of School Year', MoSY: 'Middle of School Year', EoSY: 'End of School Year' };
const text = value => String(value ?? '').trim();
const present = value => value !== null && value !== undefined && value !== '';
const number = value => present(value) && Number.isFinite(Number(value)) ? Number(value) : null;
const shown = value => present(value) ? String(value) : 'Not recorded';
const score = (value, maximum) => number(value) === null ? 'Not recorded' : `${Number(value)} / ${maximum}`;
const same = (left, right) => present(left) && present(right) && String(left) === String(right);
const correctness = item => {
  const value = item.is_correct ?? item.isCorrect ?? item.correct;
  return value === null || value === undefined ? 'Not recorded' : value ? 'Correct' : 'Incorrect';
};

// Refuse incomplete or stale details, including a period/learner switched before
// its request finishes. Use existing profile rules; printing never changes scores.
export function canPrintIndividualResult({ learner, assessment, detail, section, year, teacher, period, loading, error } = {}) {
  return Boolean(!loading && !error && learner && assessment && detail && section && year && teacher &&
    PERIOD_NAMES[period] && assessment.is_completed && detail.is_completed &&
    same(assessment.id, detail.id) && same(learner.id, assessment.learner_id) && same(learner.id, detail.learner_id) &&
    assessment.assessment_period === period && detail.assessment_period === period &&
    same(learner.class_section_id ?? learner.classSectionId, section.id) && same(section.schoolYearId, year.id) &&
    same(section.teacherId, teacher.id));
}

export function buildIndividualLearnerReport(context) {
  if (!canPrintIndividualResult(context)) throw new Error('Wait for the full saved result before printing.');
  const { learner, assessment, detail, section, year, teacher, period } = context;
  const result = { ...assessment, ...detail };
  const middle = text(learner.middle_name ?? learner.middleName).replace(/^(n\/?a|none|null|undefined|-|—)$/i, '');
  const name = [text(learner.last_name ?? learner.lastName), [text(learner.first_name ?? learner.firstName), middle, text(learner.suffix)].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const passage = hasRecordedPassageAssessment(result);
  const words = text(result.story_text).split(/\s+/).filter(Boolean);
  const dateValue = result.date_administered || result.assessment_date;
  const date = dateValue ? new Date(dateValue) : null;
  const questions = Array.isArray(result.story_questions) ? result.story_questions : [];
  const rows = (items, field) => (items || []).map((item, index) => [index + 1, shown(item[field] ?? item.content ?? item.item), correctness(item)]);
  const letterResults = result.letter_results || result.task1_results || [];
  const wordResults = result.word_results || result.task2_results || [];
  const wordAdministered = wordResults.length > 0 || number(result.task1_score) > 0;
  const notAdministered = 'Not administered (stop rule)';
  const part1Total = number(result.task1_score) === null || number(result.task2_score) === null ? null : Number(result.task1_score) + Number(result.task2_score);
  const cutoff = passage ? passageCutoffMarker({timerSeconds:result.timer_seconds,wordsRead:result.words_read,passageWords:words}) : null;
  return {
    title: 'Individual Learner Assessment Summary',
    learnerName: name || 'Not recorded',
    school: text(teacher.school_name), schoolId: text(teacher.school_id),
    teacherName: text(teacher.full_name ?? teacher.fullName),
    identity: [
      ['Learner name', name || 'Not recorded'], ['LRN', shown(learner.lrn)],
      ['Sex', shown(learner.sex)], ['Grade and section', `Grade 3 - ${section.name}`],
      ['School year', shown(year.label)], ['Assessment language', 'English'],
      ['Assessment period', `${period} - ${PERIOD_NAMES[period]}`],
      ['Date administered', date && Number.isFinite(date.getTime()) ? date.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'long', day: 'numeric' }) : 'Not recorded'],
    ],
    summary: [
      ['Part 1 - Letter sounds', score(result.task1_score, 10)],
      ['Part 1 - Word reading', wordAdministered ? score(result.task2_score, 10) : notAdministered],
      ['Part 1 - Total recorded score', part1Total === null ? 'Not recorded' : `${part1Total} / 20`],
      ['Part 1 - Reading level', part1Total === null ? 'Not recorded' : part1Total === 0 ? 'Full Refresher' : part1Total <= 10 ? 'Moderate Refresher' : part1Total <= 16 ? 'Light Refresher' : 'Grade Ready'],
      ['Part 2 - Passage', passage ? shown(result.story_title) : notAdministered],
      ['Passage word count', passage ? shown(number(result.passage_word_count) ?? (words.length || null)) : 'Not administered'],
      ['Words read correctly', passage ? shown(number(result.words_read)) : 'Not administered'],
      ['Total recorded miscues', passage ? shown(number(result.total_miscues)) : 'Not administered'],
      ['Reading accuracy', passage && number(result.miscue_accuracy) !== null ? `${Number(result.miscue_accuracy).toFixed(2)}%` : passage ? 'Not recorded' : 'Not administered'],
      ['Reading rate (correct words per minute)', passage && number(result.words_read) !== null && Number(result.timer_seconds) > 0 ? `${((Number(result.words_read) / Number(result.timer_seconds)) * 60).toFixed(2)} WPM` : passage ? 'Not recorded' : 'Not administered'],
      ['Elapsed reading time', passage ? `${Math.floor(Number(result.timer_seconds) / 60)} min ${Math.round(Number(result.timer_seconds) % 60)} sec` : 'Not administered'],
      ['Comprehension', passage ? score(result.comprehension_score, 6) : notAdministered],
      ['Learner experience rating', passage ? shown(number(result.experience_rating)) : 'Not administered'],
      ['Teacher observation level', passage && number(result.observation_level) !== null ? `Level ${Number(result.observation_level)}` : passage ? 'Not recorded' : 'Not administered'],
    ],
    profile: getRecordProfile(result),
    remarks: text(detail.remarks ?? assessment.remarks) || 'No remarks recorded.',
    letters: rows(letterResults, 'letter'), words: rows(wordResults, 'word'),
    passageText: passage ? text(result.story_text) : '',
    passageTitle: passage ? text(result.story_title) : '',
    cutoff: cutoff ? `Last word read at the time limit: #${cutoff.wordIndex + 1} - ${cutoff.word}` : '',
    comprehension: passage ? (result.comprehension_results || []).map((item, index) => {
      const questionIndex = Number(item.question_index ?? item.questionIndex ?? item.index ?? index);
      return [questionIndex + 1, text(item.question) || text(questions[questionIndex]?.text) || `Question ${questionIndex + 1} (text not available in saved result)`, correctness(item)];
    }) : [],
    miscues: passage ? (result.passage_miscues || []).map(item => {
      const index = number(item.word_index ?? item.wordIndex ?? item.index);
      return [index !== null && index >= 0 ? index + 1 : 'Not recorded', index !== null ? words[index] || 'Text unavailable' : shown(item.word), text(item.miscue_type ?? item.miscueType ?? item.type).replace(/SelfCorrection/g, 'Self-correction').replace(/([a-z])([A-Z])/g, '$1 $2'), shown(item.misread_word ?? item.misreadWord)];
    }) : [],
    passageAdministered: passage,
    reference: `${period} / Record ${result.id}`,
  };
}

// All supplied strings become text nodes, including names, questions and remarks.
// No learner data, stylesheets, logos or fonts are fetched by the print document.
export function createIndividualLearnerReport(document, report) {
  const node = (tag, value, className) => {
    const element = document.createElement(tag);
    if (value !== undefined) element.textContent = String(value);
    if (className) element.className = className;
    return element;
  };
  const table = (headings, rows) => {
    const element = node('table');
    if (headings) {
      const head = node('thead'), row = node('tr');
      headings.forEach(value => row.appendChild(node('th', value)));
      head.appendChild(row); element.appendChild(head);
    }
    const body = node('tbody');
    rows.forEach(values => { const row = node('tr'); values.forEach((value, index) => row.appendChild(node(!headings && index % 2 === 0 ? 'th' : 'td', value))); body.appendChild(row); });
    element.appendChild(body); return element;
  };
  const root = node('article', undefined, 'individualReport');
  const summary = node('section', undefined, 'individualSummaryPage');
  const header = node('header', undefined, 'individualReportHeader');
  header.append(node('p', 'Republic of the Philippines'), node('p', 'Department of Education'), node('h2', report.school || 'School: __________________________________'), node('p', `School ID: ${report.schoolId || '____________________'}`), node('h1', report.title), node('p', 'Comprehensive Rapid Literacy Assessment (CRLA) - Grade 3 English'));
  summary.appendChild(header);
  const identityRows = [];
  for (let index = 0; index < report.identity.length; index += 2) identityRows.push([...report.identity[index], ...(report.identity[index + 1] || ['', ''])]);
  const identity = table(null, identityRows); identity.className = 'individualIdentity'; summary.appendChild(identity);
  summary.appendChild(node('h2', 'Final assessment results'));
  summary.appendChild(table(['Assessment component', 'Recorded result'], report.summary));
  summary.appendChild(node('p', `Final reading profile: ${report.profile}`, 'individualProfile'));
  const remarks = node('section', undefined, 'individualRemarks');
  remarks.append(node('h3', 'Teacher remarks / observations'), node('p', report.remarks)); summary.appendChild(remarks);
  const signature = node('section', undefined, 'individualSignature');
  signature.append(node('p', 'Prepared by:'), node('div', '\u00a0', 'individualWetSignature'), node('strong', report.teacherName || '________________________________', 'individualTeacherName'), node('p', 'Signature over printed name of assigned teacher'), node('p', 'Date signed: ____________________'), node('p', `CRL-App learner report | ${report.reference} | Supporting individual record`, 'individualReportFootnote'));
  summary.appendChild(signature); root.appendChild(summary);
  const evidence = node('section', undefined, 'individualEvidencePage');
  evidence.append(node('h2', 'Assessment evidence'), node('p', `${report.learnerName} | ${report.reference}`, 'individualEvidenceIdentity'));
  const decoding = node('div', undefined, 'individualDecoding');
  for (const [title, rows] of [['Letter sounds', report.letters], ['Word reading', report.words]]) {
    const block = node('section'); block.appendChild(node('h3', title));
    block.appendChild(rows.length ? table(['No.', 'Item', 'Result'], rows) : node('p', 'No item-level evidence recorded.'));
    decoding.appendChild(block);
  }
  evidence.appendChild(decoding);
  evidence.appendChild(node('h3', 'Passage reading'));
  evidence.appendChild(node('p', report.passageAdministered ? report.passageTitle || 'Passage title not recorded.' : 'Not administered (stop rule).'));
  if (report.passageAdministered) {
    evidence.appendChild(node('p', report.passageText || 'Historical passage text unavailable.', 'individualPassage'));
    if (report.cutoff) evidence.appendChild(node('p', report.cutoff));
    evidence.appendChild(node('h3', 'Comprehension responses'));
    evidence.appendChild(report.comprehension.length ? table(['No.', 'Question', 'Result'], report.comprehension) : node('p', 'No item-level comprehension evidence recorded.'));
    evidence.appendChild(node('h3', 'Recorded reading miscues'));
    evidence.appendChild(report.miscues.length ? table(['Word no.', 'Passage word', 'Miscue type', 'Read as'], report.miscues) : node('p', 'No miscues recorded.'));
  }
  root.appendChild(evidence); return root;
}

export const INDIVIDUAL_REPORT_PRINT_CSS = `
  body{margin:0;font:9.5pt Arial,sans-serif;line-height:1.25;color:#111}
  .individualReportHeader{text-align:center;margin-bottom:4mm}
  .individualReportHeader p{margin:1mm 0}.individualReportHeader h1{font-size:15pt;margin:4mm 0 2mm}
  .individualReportHeader h2{font-size:12pt;margin:2mm 0}
  .individualSummaryPage{display:block;box-sizing:border-box}
  h2{font-size:12pt;margin:5mm 0 2mm}h3{font-size:10pt;margin:3mm 0 2mm;break-after:avoid}
  table{width:100%;table-layout:fixed;border-collapse:collapse;font:inherit}
  th,td{box-sizing:border-box;border:1px solid #999;padding:1.1mm 2mm;text-align:left;vertical-align:top;overflow-wrap:anywhere}
  th{font-weight:600}thead{display:table-header-group}tr{break-inside:avoid}
  .individualSummaryPage table:not(.individualIdentity) th:first-child{width:43%}
  .individualSummaryPage table.individualIdentity{font-size:9pt}
  .individualSummaryPage table.individualIdentity th{width:17%}.individualIdentity td{width:33%}
  .individualProfile{font-weight:bold;font-size:12pt;border:1px solid #222;padding:3mm;margin:4mm 0 0;break-inside:avoid}
  .individualRemarks p{white-space:pre-wrap;overflow-wrap:anywhere;margin:0 0 4mm}
  .individualSignature{margin-top:4mm;padding-top:0;break-inside:avoid}
  .individualSignature p{margin:1mm 0}.individualWetSignature{height:12mm}
  .individualTeacherName{display:block;width:90mm;max-width:100%;border-top:1px solid #222;padding-top:1.5mm;overflow-wrap:anywhere;text-transform:uppercase}
  .individualReportFootnote{font-size:8pt;padding-top:4mm;color:#444}
  .individualEvidencePage{break-before:page;font-size:9pt}
  .individualEvidencePage h2{margin-top:0}.individualEvidenceIdentity{border-bottom:1px solid #333;padding-bottom:3mm}
  .individualDecoding{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:5mm}.individualDecoding>section{min-width:0}
  .individualDecoding th:first-child{width:10mm}.individualDecoding th:last-child{width:20mm}
  .individualPassage{white-space:pre-wrap;overflow-wrap:anywhere}
  .individualEvidencePage>table th:first-child{width:18mm}.individualEvidencePage>table th:last-child{width:23mm}
`;
