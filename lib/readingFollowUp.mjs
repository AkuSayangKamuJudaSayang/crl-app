import { learnerPeriodProfile } from './learnerPeriodResults.mjs';
import { readLearnerRecommendations } from './learnerRecommendations.mjs';
import { formatName } from './recordViewModel.mjs';

const searchWords = value => String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

export function matchesReadingFollowUp(learner, result, period, profileFilter, recommendationFilter, search = '') {
  const profile = learnerPeriodProfile(result);
  const saved = Boolean(readLearnerRecommendations(learner.period_recommendations)[period]);
  const nameAndLrn = searchWords([formatName(learner), learner.middle_name, learner.lrn].join(' ')).join(' ');
  return (!profileFilter || profile === profileFilter || (profileFilter === 'unassessed' && !profile)) &&
    (!recommendationFilter || saved === (recommendationFilter === 'with')) &&
    searchWords(search).every(word => nameAndLrn.includes(word));
}
