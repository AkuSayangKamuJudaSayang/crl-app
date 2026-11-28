import { isReadingIntervention } from './readingInterventions.mjs';

export const RECOMMENDATION_PERIODS = ['BoSY', 'MoSY', 'EoSY'];
export const RECOMMENDATION_LIMIT = 1000;

export function readLearnerRecommendations(value) {
  return Object.fromEntries(RECOMMENDATION_PERIODS.flatMap(period => {
    const text = typeof value?.[period] === 'string' ? value[period].trim().slice(0, RECOMMENDATION_LIMIT) : '';
    return text ? [[period, text]] : [];
  }));
}

export function readLearnerInterventions(value, period) {
  const selection = value?.interventions?.[period];
  return Array.isArray(selection) ? [...new Set(selection.filter(isReadingIntervention))] : [];
}

export function readLearnerFollowUp(value) {
  const recommendations = readLearnerRecommendations(value);
  const interventions = Object.fromEntries(RECOMMENDATION_PERIODS.flatMap(period => {
    const ids = readLearnerInterventions(value, period);
    return ids.length ? [[period, ids]] : [];
  }));
  return Object.keys(interventions).length ? { ...recommendations, interventions } : recommendations;
}

export function validateLearnerRecommendationChanges(value) {
  const invalid = message => Object.assign(new Error(message), { status: 400 });
  const { interventions, ...textValue } = value ?? {};
  const entries = Object.entries(textValue);
  const selections = interventions && typeof interventions === 'object' && !Array.isArray(interventions)
    ? Object.entries(interventions) : [];
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      (!entries.length && !selections.length) ||
      entries.some(([period, recommendation]) => !RECOMMENDATION_PERIODS.includes(period) || typeof recommendation !== 'string')) {
    throw invalid('Choose a valid assessment period.');
  }
  if ((interventions !== undefined && !selections.length) || selections.some(([period, ids]) =>
    !RECOMMENDATION_PERIODS.includes(period) || !Array.isArray(ids) || ids.length > 10 || !ids.every(isReadingIntervention))) {
    throw invalid('Choose valid reading interventions.');
  }
  if (entries.some(([, recommendation]) => recommendation.trim().length > RECOMMENDATION_LIMIT)) {
    throw invalid(`Recommendations must be ${RECOMMENDATION_LIMIT.toLocaleString('en-US')} characters or fewer.`);
  }
  const changes = Object.fromEntries(entries.map(([period, recommendation]) => [period, recommendation.trim()]));
  if (selections.length) changes.interventions = Object.fromEntries(selections.map(([period, ids]) => [period, [...new Set(ids)]]));
  return changes;
}

function mergeChanges(current, changes) {
  const merged = { ...current, ...changes };
  if (current?.interventions || changes?.interventions) {
    merged.interventions = { ...current?.interventions, ...changes?.interventions };
  }
  return merged;
}

export function applyLearnerRecommendationChanges(current, changes) {
  return readLearnerFollowUp(mergeChanges(current, changes));
}

export function applyLearnerRecommendationReceipt(current, receipt, submitted) {
  const text = readLearnerRecommendations(receipt);
  const changes = {};
  const selections = {};
  for (const period of RECOMMENDATION_PERIODS) {
    if (Object.hasOwn(submitted, period)) changes[period] = text[period] ?? '';
    if (Object.hasOwn(submitted.interventions ?? {}, period)) selections[period] = readLearnerInterventions(receipt, period);
  }
  return applyLearnerRecommendationChanges(current, { ...changes, interventions: selections });
}

export function projectLearnerRecommendations(learners, entries) {
  const pending = entries.filter(entry => entry.kind === 'save_learner_recommendations');
  if (!pending.length) return learners;
  const enrollments = new Map();
  const key = (sectionId, id) => `${sectionId}:${Number(id)}`;
  for (const learner of learners) {
    const sectionId = learner.class_section_id ?? learner.classSectionId;
    enrollments.set(key(sectionId, learner.id), learner);
    if (learner.local_id != null) enrollments.set(key(sectionId, learner.local_id), learner);
  }
  const changes = new Map();
  for (const { body } of pending) {
    const learner = enrollments.get(key(body.class_section_id, body.learner_id));
    if (learner) changes.set(learner, mergeChanges(changes.get(learner), body.recommendations));
  }
  return learners.map(learner => changes.has(learner) ? {
    ...learner,
    period_recommendations: applyLearnerRecommendationChanges(learner.period_recommendations, changes.get(learner)),
  } : learner);
}
