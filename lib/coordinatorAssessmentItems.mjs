/*
 * Shared, side-effect-free rules for the Reading Coordinator's row editor.
 * The server revalidates published contents independently; client checks
 * exist to show duplicate/invalid entries while the coordinator types.
 */
export const COORDINATOR_WORD_MAX_LENGTH = 15;

export function coordinatorItemIdentity(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function cleanCoordinatorItem(category, value) {
  const lettersOnly = String(value ?? "").replace(/[^a-z]/gi, "");
  if (category === "letters") return lettersOnly.slice(0, 1).toUpperCase();
  if (category === "words") return lettersOnly.slice(0, COORDINATOR_WORD_MAX_LENGTH);
  return String(value ?? "").trim();
}

export function coordinatorEntryRowErrors(category, rows, savedItems = [], editingIndex = null) {
  if (!["letters", "words"].includes(category)) return [];
  const list = Array.isArray(rows) ? rows : [];
  const existing = new Set((Array.isArray(savedItems) ? savedItems : [])
    .filter((_, index) => editingIndex === null || index !== editingIndex)
    .map(coordinatorItemIdentity));
  const counts = new Map();
  for (const raw of list) {
    const key = coordinatorItemIdentity(raw);
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  }

  return list.map(raw => {
    const value = String(raw ?? "").trim();
    const identity = coordinatorItemIdentity(value);
    if (!value) return category === "letters" ? "Enter one letter." : "Enter one word.";
    if (category === "letters" && !/^[A-Z]$/.test(value)) return "Enter exactly one uppercase letter (A–Z).";
    if (category === "words" && !/^[A-Za-z]{1,15}$/.test(value)) return "Use one word of up to 15 letters (A–Z).";
    if (existing.has(identity)) return category === "letters" ? "This letter already exists." : "This word already exists.";
    if (counts.get(identity) > 1) return "This item is already entered in another row.";
    return "";
  });
}

export function applyCoordinatorItemRows(current, category, rows, editingIndex = null) {
  if (!["letters", "words"].includes(category)) throw Error("Select letters or words.");
  const existing = current?.content?.[category] || [];
  const normalized = (Array.isArray(rows) ? rows : []).map(value => cleanCoordinatorItem(category, value));
  if (!normalized.length) throw Error("Add at least one row.");
  const problems = coordinatorEntryRowErrors(category, normalized, existing, editingIndex);
  if (problems.some(Boolean)) throw Error(problems.find(Boolean));
  const list = [...existing];
  if (editingIndex === null) list.push(...normalized);
  else {
    if (!Number.isInteger(editingIndex) || editingIndex < 0 || editingIndex >= list.length ||
        normalized.length !== 1) throw Error("Select one item to edit.");
    list[editingIndex] = normalized[0];
  }
  const old = editingIndex === null ? null : existing[editingIndex];
  const defaults = [...(current.defaults[category] || [])].map(value =>
    old !== null && coordinatorItemIdentity(value) === coordinatorItemIdentity(old) ? normalized[0] : value
  );
  return {
    ...current,
    content: { ...current.content, [category]: list },
    defaults: { ...current.defaults, [category]: defaults },
  };
}
