const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

(async () => {
  const forms = await import("../lib/teacherForms.js");
  const content = await import("../lib/assessmentContent.js");
  const guides = await import("../lib/storyComprehension.mjs");
  const page = fs.readFileSync("app/teacher/page.jsx", "utf8");
  const copy = value => structuredClone(value);
  const initial = {
    category: "stories", index: 0, title: "Test passage", editorMode: "document",
    storyText: content.DEFAULT_ASSESSMENT_CONTENT.BoSY.stories[0].text,
    questions: Array.from({ length: 6 }, (_, index) => ({ text: `Question ${index + 1}?`, possibleAnswer: `Answer ${index + 1}.` })),
  };
  initial.storyWords = content.splitStoryWords(initial.storyText);
  let dirty = false;
  const notices = [];
  const context = vm.createContext({ ...forms, ...content, ...guides, Date,
    useCallback: callback => callback,
    activityEditorBaselineRef: { current: null }, activityEditor: null, storyImport: null, storyClosePrompt: null,
    setActivityEditor: value => { context.activityEditor = value; },
    setStoryClosePrompt: value => { context.storyClosePrompt = value; },
    setStoryImport: value => { context.storyImport = value; }, setStoryImportDragActive() {},
    activities: content.cloneAssessmentContent(), activityPeriod: "BoSY",
    setActivities: value => { context.activities = value; }, setActivityPeriodDirty: () => { dirty = true; },
    showToast: message => notices.push(message),
  });
  const begin = page.indexOf("  const openActivityEditor =");
  const end = page.indexOf("  const containStoryEditorFocus", begin);
  vm.runInContext(page.slice(begin, end) + "\nthis.open = openActivityEditor; this.closeEditor = requestCloseActivityEditor; this.closeImport = requestCloseStoryImport;", context);
  for (const change of [draft => { draft.title = "Changed title"; }, draft => { draft.storyText += " extra"; },
    draft => { draft.questions[0].text = "A revised question?"; }, draft => { draft.questions[0].possibleAnswer = "A revised answer."; }]) {
    context.open(copy(initial)); change(context.activityEditor); context.closeEditor();
    assert.equal(context.storyClosePrompt, "editor");
    assert.ok(context.activityEditor, "Closing must not discard a modified passage, question or possible answer");
  }
  context.open(copy(initial));
  context.activityEditor = forms.switchStoryEditorMode(context.activityEditor, "boxes");
  context.closeEditor();
  assert.equal(context.activityEditor, null, "Changing only the editor view should not create a false unsaved prompt");
  const blank = { ...copy(initial), index: -1, title: "", storyText: "", storyWords: [], questions: Array.from({ length: 6 }, () => ({ text: "", possibleAnswer: "" })) };
  context.open(copy(blank)); context.closeEditor(); assert.equal(context.activityEditor, null);
  context.open(copy(blank)); context.activityEditor.storyText = "A new passage"; context.closeEditor();
  assert.equal(context.storyClosePrompt, "editor"); assert.ok(context.activityEditor);
  context.open(copy(initial), true); context.closeEditor(); assert.equal(context.storyClosePrompt, "editor", "An imported passage is unsaved even before additional edits");
  context.storyImport = { status: "ready", title: "Imported passage", text: initial.storyText }; context.storyClosePrompt = null;
  context.closeImport(); assert.equal(context.storyClosePrompt, "import"); assert.equal(context.storyImport.status, "ready");
  context.storyImport = { status: "reading" }; context.storyClosePrompt = null; context.closeImport(); assert.equal(context.storyImport.status, "reading");
  context.storyImport = { status: "idle" }; context.closeImport(); assert.equal(context.storyImport, null);
  console.log("PASS X/Cancel close guard protects passage, title, questions, answers and imported drafts without flagging view-only changes");

  const saveBegin = page.indexOf("  const saveActivity =");
  const saveEnd = page.indexOf("  /*\n   * Import a passage", saveBegin);
  vm.runInContext(page.slice(saveBegin, saveEnd) + "\nthis.save = saveActivity;", context);
  context.open(copy(initial)); context.activityEditor.storyText = "Too short"; context.storyClosePrompt = "editor";
  context.save(); assert.ok(context.activityEditor); assert.equal(dirty, false); assert.match(notices.at(-1), /exactly 100 words/);
  context.open(copy(initial)); context.activityEditor.questions[0].possibleAnswer = ""; context.save();
  assert.ok(context.activityEditor); assert.equal(dirty, false); assert.match(notices.at(-1), /answer/i);
  context.open(copy(initial)); context.activityEditor.title = "Saved draft title"; context.storyClosePrompt = "editor";
  context.save(); assert.equal(context.activityEditor, null); assert.equal(context.storyClosePrompt, null); assert.equal(dirty, true);
  assert.equal(context.activities.BoSY.stories[0].title, "Saved draft title");
  assert.equal(content.splitStoryWords(context.activities.BoSY.stories[0].text).length, 100);
  assert.equal(context.activities.BoSY.stories[0].questions.length, 6);
  console.log("PASS Save Story preserves 100-word/six-answer validation, leaves invalid drafts open and saves valid changes to the existing assessment draft flow");

  const editorMarkup = page.slice(page.indexOf("        {activityEditor && ("), page.indexOf("        {storyImport && ("));
  assert.ok(!editorMarkup.includes("onMouseDown="));
  assert.equal((editorMarkup.match(/onClick=\{requestCloseActivityEditor\}/g) || []).length, 2);
  assert.ok(editorMarkup.includes('"assessmentSaveButton"'));
  assert.ok(page.includes("requestCloseStoryImport();\n      } else if (activityEditor) {\n        requestCloseActivityEditor();"));
  const unloadBegin = page.indexOf("  useEffect(() => {\n    if (!Object.keys(activityDirtyPeriods)");
  const unloadEnd = page.indexOf("\n\n  const dashboardRows", unloadBegin);
  for (const draftType of ["activityEditorDirty", "importedStoryDirty"]) {
    let listener, removed;
    const guard = vm.createContext({ activityDirtyPeriods: {}, scoresheetDirty: false, activityEditorDirty: false, importedStoryDirty: false,
      [draftType]: true, useEffect: callback => { removed = callback(); },
      window: { addEventListener: (type, callback) => { assert.equal(type, "beforeunload"); listener = callback; }, removeEventListener: () => { listener = null; } },
    });
    vm.runInContext(page.slice(unloadBegin, unloadEnd), guard);
    let prevented = false; listener({ preventDefault: () => { prevented = true; } }); assert.ok(prevented);
    removed(); assert.equal(listener, null);
  }
  console.log("PASS backdrop taps cannot dismiss the editor, device Back uses the same guard and reload protection includes open story drafts");
})().catch(error => { console.error(error); process.exitCode = 1; });
