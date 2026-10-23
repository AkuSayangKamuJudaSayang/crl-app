export const CLASS_ACTIONS = new Set(["get_classes", "save_school_year", "save_class_section", "archive_class", "download_class_archive", "import_class_archive"]);
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function workspaceError(message, status = 400) {
  return Object.assign(new Error(message), {
    status
  });
}
export function schoolYearLabel(startYear) {
  const year = Number(startYear);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw workspaceError("Enter a school-year start between 2000 and 2100.");
  return `${year}-${year + 1}`;
}
export function sectionName(value) {
  const name = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!name || name.length > 50 || /[\u0000-\u001f]/.test(name)) throw workspaceError("Enter a section name of 1 to 50 characters.");
  return name;
}
export function periodEligibility(assessments, learnerId, period) {
  if (!["BoSY", "MoSY", "EoSY"].includes(period)) return "Choose a valid assessment period.";
  const done = new Set((assessments || []).filter(row => Number(row.learner_id ?? row.learnerId) === Number(learnerId) && Boolean(row.is_completed ?? row.isCompleted)).map(row => row.assessment_period ?? row.assessmentPeriod));
  if (done.has(period)) return `${period} is already completed for this learner.`;
  if (period === "MoSY" && !done.has("BoSY")) return "Complete BoSY before starting MoSY.";
  if (period === "EoSY" && !done.has("MoSY")) return "Complete MoSY before starting EoSY.";
  return "";
}
export function deletionPhrase(learners) {
  return learners.length === 1 ? String(learners[0].first_name ?? learners[0].firstName ?? "").trim() : `DELETE ${learners.length} LEARNERS`;
}
export function validateLearnerDeletion(learners, body, requestedCount = learners.length) {
  const phrase = requestedCount === 1 ? deletionPhrase(learners) : `DELETE ${requestedCount} LEARNERS`;
  if (!phrase || String(body?.confirmation ?? "").trim() !== phrase) throw workspaceError("Type the requested confirmation exactly before deleting.");
  const reason = String(body?.deletion_reason ?? "").trim();
  if (reason.length < 5 || reason.length > 300) throw workspaceError("Provide a deletion reason of 5 to 300 characters.");
  return reason;
}
export function validateRemarkRecords(records) {
  if (!Array.isArray(records) || records.length < 1 || records.length > 200) throw workspaceError("Provide between 1 and 200 remarks to save.");
  const seen = new Set();
  return records.map(record => {
    if (!record || Object.keys(record).some(key => !["id", "remarks"].includes(key))) throw workspaceError("Only remarks can be edited in the scoresheet.");
    const id = Number(record.id);
    if (!Number.isInteger(id) || id === 0 || seen.has(id)) throw workspaceError("Choose distinct valid assessment records.");
    seen.add(id);
    if (typeof record.remarks !== "string" || record.remarks.length > 5000) throw workspaceError("Remarks must be 5,000 characters or fewer.");
    return {
      id,
      remarks: record.remarks.trim()
    };
  });
}
export function classIdOf(learner) {
  return learner?.class_section_id ?? learner?.classSectionId ?? null;
}
