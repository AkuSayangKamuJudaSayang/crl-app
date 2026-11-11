/**
 * A small, tab-scoped return hint for an assessment opened as a standalone
 * route (for example after a crash/recovery). The normal online and offline
 * paths keep the original teacher dashboard mounted and do not need to reload
 * the roster. This hint stores class identifiers only, never learner data.
 */
const KEY = "crla_teacher_conduct_return_v1";
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

function storageOf(storage) {
  if (storage !== undefined) return storage;
  try { return globalThis.sessionStorage; } catch { return null; }
}

function id(value) {
  const result = String(value ?? "").trim();
  return result.length && result.length <= 96 ? result : "";
}

export function rememberConductAssessmentReturn({ teacherId, schoolYearId, sectionId }, storage) {
  const owner = id(teacherId), year = id(schoolYearId), section = id(sectionId);
  if (!owner || !year || !section) return false;
  try {
    const store = storageOf(storage);
    if (!store) return false;
    store.setItem(KEY, JSON.stringify({ teacherId: owner, schoolYearId: year, sectionId: section, savedAt: Date.now() }));
    return true;
  } catch { return false; }
}

export function clearConductAssessmentReturn(storage) {
  try { storageOf(storage)?.removeItem(KEY); } catch {}
}

export function consumeConductAssessmentReturn(teacherId, catalog, storage, now = Date.now()) {
  const store = storageOf(storage);
  if (!store) return null;
  let saved;
  try {
    const raw = store.getItem(KEY);
    if (!raw) return null;
    store.removeItem(KEY);
    saved = JSON.parse(raw);
  } catch { return null; }
  const validTime = Number.isFinite(saved?.savedAt) &&
    Number.isFinite(now) && saved.savedAt <= now && now - saved.savedAt <= MAX_AGE_MS;
  if (!validTime || id(saved.teacherId) !== id(teacherId)) return null;
  const section = Array.isArray(catalog?.sections) &&
    catalog.sections.find(item => id(item.id) === id(saved.sectionId) &&
      id(item.schoolYearId) === id(saved.schoolYearId) && !item.archivedAt);
  const year = Array.isArray(catalog?.schoolYears) &&
    catalog.schoolYears.find(item => id(item.id) === id(saved.schoolYearId) && !item.archivedAt);
  if (!section || !year) return null;
  return { schoolYearId: id(saved.schoolYearId), sectionId: id(saved.sectionId) };
}
