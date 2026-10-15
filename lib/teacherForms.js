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

// Compare the content that Save Story will retain, independent of which view
// is open. Switching between Plain Text and Blocks must not invent an edit.
export function getActivityEditorDraft(editor) {
  if (!editor) return null;
  if (editor.category === "stories") {
    const words = editor.editorMode === "boxes"
      ? (editor.storyWords || []).map(word => String(word || "").trim()).filter(Boolean)
      : splitStoryWords(editor.storyText);
    return JSON.stringify({
      title: String(editor.title || "").trim(),
      text: words.join(" "),
      questions: (editor.questions || []).map(question => ({
        text: String(question.text || "").trim(),
        possibleAnswer: String(question.possibleAnswer || "").trim(),
      })),
    });
  }
  return JSON.stringify(editor.index < 0 ? editor.values || [editor.value || ""] : editor.value || "");
}

export function hasActivityEditorChanges(editor, baseline) {
  return Boolean(editor && getActivityEditorDraft(editor) !== baseline);
}
