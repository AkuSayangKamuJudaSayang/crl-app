export const RECOMMENDATION_PERIODS = ['BoSY', 'MoSY', 'EoSY'];
export const RECOMMENDATION_LIMIT = 1000;
export function readLearnerRecommendations(value) {
  return Object.fromEntries(RECOMMENDATION_PERIODS.flatMap(period => {
    const text = typeof value?.[period] === 'string' ? value[period].trim().slice(0, RECOMMENDATION_LIMIT) : '';
    return text ? [[period, text]] : [];
  }));
}

export function validateLearnerRecommendationChanges(value) {
  const entries = value && typeof value === 'object' && !Array.isArray(value) ? Object.entries(value) : [];
  if (!entries.length || entries.some(([period, recommendation]) =>
    !RECOMMENDATION_PERIODS.includes(period) || typeof recommendation !== 'string'
  )) throw Object.assign(new Error('Choose a valid assessment period.'), { status: 400 });

  if (entries.some(([, recommendation]) => recommendation.trim().length > RECOMMENDATION_LIMIT))
    throw Object.assign(new Error(`Recommendations must be ${RECOMMENDATION_LIMIT.toLocaleString('en-US')} characters or fewer.`), { status: 400 });

  return Object.fromEntries(entries.map(([period, recommendation]) => [period, recommendation.trim()]));
}

export function applyLearnerRecommendationChanges(current, changes) {
  return readLearnerRecommendations({ ...current, ...changes });
}

export function projectLearnerRecommendations(learners, entries) {
  const byLearner = new Map();
  for (const { kind, body } of entries) {
    if (kind !== 'save_learner_recommendations') continue;
    const key = `${body.class_section_id}:${Number(body.learner_id)}`;
    byLearner.set(key, { ...byLearner.get(key), ...body.recommendations });
  }
  if (!byLearner.size) return learners;
  return learners.map(learner => {
    const sectionId = learner.class_section_id ?? learner.classSectionId;
    const canonical = byLearner.get(`${sectionId}:${Number(learner.id)}`);
    const local = byLearner.get(`${sectionId}:${Number(learner.local_id)}`);
    const changes = canonical && local ? { ...local, ...canonical } : canonical ?? local;
    return changes ? {
      ...learner,
      period_recommendations: applyLearnerRecommendationChanges(learner.period_recommendations, changes),
    } : learner;
  });
}
