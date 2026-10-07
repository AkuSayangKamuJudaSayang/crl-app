import { ASSESSMENT_CONTENT_REQUIREMENTS, splitStoryWords } from "./assessmentContent.js";

export function getLearnerRowErrors(row) {
  const errors = {};
  if (!/^\d{12}$/.test(String(row?.lrn || "").trim())) errors.lrn = "LRN must contain exactly 12 digits.";
  if (!String(row?.lastName || "").trim()) errors.lastName = "Last name is required.";
  if (!String(row?.firstName || "").trim()) errors.firstName = "First name is required.";
  if (!["Male", "Female"].includes(row?.sex)) errors.sex = "Select Male or Female.";
  return errors;
}

export function switchStoryEditorMode(editor, mode) {
  if (!editor || editor.category !== "stories" || !["boxes", "document"].includes(mode) || editor.editorMode === mode) return editor;
  if (mode === "document") {
    const text = editor.storyWords.map(word => String(word || "").trim()).filter(Boolean).join(" ");
    return { ...editor, editorMode: mode, storyText: text };
  }
  const words = splitStoryWords(editor.storyText);
  const limit = ASSESSMENT_CONTENT_REQUIREMENTS.storyWords;
  if (words.length > limit) throw new Error(`Reduce the story to ${limit} words before switching to blocks.`);
  return { ...editor, editorMode: mode, storyWords: Array.from({ length: limit }, (_, index) => words[index] || "") };
}
