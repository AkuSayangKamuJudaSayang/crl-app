export function blankExportRow(learner, index, name) {
  return {
    sn: index + 1,
    lrn: learner.lrn,
    name,
    sex: learner.sex,
    assessed: false,
    date: null,
    task1: null,
    task2: null,
    total: null,
    totalFraction: null,
    part1: "",
    story: null,
    miscues: null,
    wordsRead: null,
    minutes: null,
    seconds: null,
    wpm: null,
    readingPct: null,
    readingPctFraction: null,
    comprehensionScore: null,
    compFraction: null,
    experience: null,
    observation: null,
    readingProfile: "",
    remarks: ""
  };
}
export function rosterRecords(learners, assessments, period) {
  return (learners || []).map(learner => {
    const assessment = (assessments || []).filter(a => Number(a.learner_id ?? a.learnerId) === Number(learner.id) && (a.assessment_period ?? a.assessmentPeriod) === period && Boolean(a.is_completed ?? a.isCompleted)).sort((a, b) => new Date(b.date_administered ?? b.dateAdministered) - new Date(a.date_administered ?? a.dateAdministered) || Number(b.id) - Number(a.id))[0];
    return {
      learner,
      assessment: assessment || {
        id: `enrolled-${learner.id}`,
        learner_id: learner.id,
        assessment_period: period,
        is_completed: false,
        enrolled_only: true
      }
    };
  });
}
