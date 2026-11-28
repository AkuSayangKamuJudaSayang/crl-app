import { getRecordProfile } from './recordViewModel.mjs';

const resultDate = row => Date.parse(row.date_administered || row.assessment_date) || 0;

export function latestLearnerPeriodResults(assessments) {
  const byLearner = new Map();
  for (const assessment of assessments) {
    const learnerId = String(assessment.learner_id);
    const period = assessment.assessment_period;
    if (!byLearner.has(learnerId)) byLearner.set(learnerId, {});
    const periods = byLearner.get(learnerId);
    const previous = periods[period];
    // A saved result takes precedence over an unfinished attempt.
    if (previous) {
      const completionOrder = Number(Boolean(assessment.is_completed)) - Number(Boolean(previous.is_completed));
      const order = completionOrder || resultDate(assessment) - resultDate(previous) || Number(assessment.id) - Number(previous.id);
      if (!(order > 0)) continue;
    }
    periods[period] = assessment;
  }
  return byLearner;
}

export function learnerPeriodStatus(result) {
  if (!result) return 'Not yet assessed';
  if (!result.is_completed) return 'Incomplete';
  return result.offline_pending ? 'Completed · Sync pending' : 'Completed';
}

export function learnerPeriodProfile(result) {
  return result?.is_completed ? getRecordProfile(result) : '';
}

export function countLearnerMiscues(detail) {
  if (!Array.isArray(detail?.passage_miscues)) return null;
  const counts = new Map();
  for (const item of detail.passage_miscues) {
    const type = String(item.miscue_type ?? item.miscueType ?? item.type ?? '').toLowerCase().replace(/[^a-z]/g, '');
    if (type === 'lastwordread' || item.isCutoffMarker) continue;
    const key = type || 'miscue';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}
