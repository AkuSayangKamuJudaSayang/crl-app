import { classIdOf, orderedSchoolYears } from "./classWorkspace.mjs";

function owned(row, teacherId) {
  const owner = row?.teacherId ?? row?.teacher_id;
  return !owner || !teacherId || Number(owner) === Number(teacherId);
}

export function analyticsClassChoices(catalog = {}, teacherId) {
  catalog = catalog || {};
  const deletedYears = new Set(catalog.deletedYearIds || []);
  const deletedSections = new Set(catalog.deletedSectionIds || []);
  const years = orderedSchoolYears(catalog.schoolYears).filter(row =>
    !row.deletedAt && !deletedYears.has(row.id) && owned(row, teacherId));
  const yearIds = new Set(years.map(row => row.id));
  const sections = (catalog.sections || []).filter(row => !row.deletedAt &&
    !deletedSections.has(row.id) && yearIds.has(row.schoolYearId) && owned(row, teacherId));
  return { years, sections };
}

export function analyticsClassScope(catalog, yearId, sectionId, learners = [], assessments = [], teacherId) {
  const { years, sections } = analyticsClassChoices(catalog, teacherId);
  const year = years.find(row => row.id === yearId) || null;
  const section = year ? sections.find(row => row.id === sectionId && row.schoolYearId === year.id) || null : null;
  if (!section) return { year, section: null, learners: [], assessments: [] };
  const classLearners = learners.filter(row => classIdOf(row) === section.id && owned(row, teacherId));
  const learnerIds = new Set(classLearners.map(row => Number(row.id)));
  return { year, section, learners: classLearners, assessments: assessments.filter(row =>
    learnerIds.has(Number(row.learner_id ?? row.learnerId)) && owned(row, teacherId)) };
}
