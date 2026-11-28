import { readLearnerInterventions, readLearnerRecommendations } from './learnerRecommendations.mjs';
import { learnerPeriodProfile, learnerPeriodStatus } from './learnerPeriodResults.mjs';
import { readingInterventionLabels } from './readingInterventions.mjs';
import { formatName } from './recordViewModel.mjs';

export async function buildReadingFollowUpReport({ learners, results, period, section, year }) {
  const XLSX = await import('xlsx');
  const rows = [
    ['School year', 'Section', 'Period', 'LRN', 'Learner', 'Assessment status', 'Reading profile', 'Recommendation', 'Interventions'],
    ...learners.map(learner => {
      const result = results.get(String(learner.id))?.[period];
      return [year, section, period, String(learner.lrn ?? ''), formatName(learner), learnerPeriodStatus(result),
        learnerPeriodProfile(result), readLearnerRecommendations(learner.period_recommendations)[period] ?? '',
        readingInterventionLabels(readLearnerInterventions(learner.period_recommendations, period)).join(', ')];
    }),
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!autofilter'] = { ref: sheet['!ref'] };
  sheet['!cols'] = [15, 18, 12, 17, 32, 26, 26, 65, 55].map(wch => ({ wch }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Reading Follow-Up');
  const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
  const slug = value => String(value ?? '').replace(/[^\p{L}\p{N}._-]+/gu, '_').slice(0, 60);
  return {
    blob: new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    filename: `CRLA_Reading_Follow_Up_${slug(year)}_${slug(section)}_${period}.xlsx`,
  };
}
