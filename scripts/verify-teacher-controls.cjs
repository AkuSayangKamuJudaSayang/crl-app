const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

(async () => {
  const { getLearnerRowErrors, switchStoryEditorMode } = await import("../lib/teacherForms.js");
  const {periodEligibility} = await import("../lib/classWorkspace.mjs");
  const page = fs.readFileSync("app/teacher/page.jsx", "utf8");
  const valid = { id: 1, lrn: "123456789012", firstName: "Test", lastName: "Learner", sex: "Female" };
  for (const [field, value, message] of [["lrn", "123", /exactly 12/], ["lastName", "  ", /Last name is required/], ["firstName", "", /First name is required/]]) {
    const errors = getLearnerRowErrors({ ...valid, [field]: value });
    assert.deepEqual(Object.keys(errors), [field]);
    assert.match(errors[field], message);
  }
  assert.deepEqual(getLearnerRowErrors(valid), {});

  const passage = Array.from({ length: 100 }, (_, index) => `word${index}`).join(" ");
  const editor = { category: "stories", editorMode: "document", index: 2, title: "Original title", storyText: passage, storyWords: [] };
  const boxes = switchStoryEditorMode(editor, "boxes");
  assert.equal(boxes.storyWords.length, 100);
  boxes.storyWords[49] = "replacement";
  const text = switchStoryEditorMode(boxes, "document");
  assert.equal(text.storyText.split(" ")[49], "replacement");
  const roundtrip = switchStoryEditorMode(text, "boxes");
  assert.deepEqual(roundtrip.storyWords, boxes.storyWords);
  assert.equal(roundtrip.index, 2);
  assert.equal(roundtrip.title, editor.title);
  assert.equal(switchStoryEditorMode({ ...editor, storyText: "one two" }, "boxes").storyWords.filter(Boolean).length, 2);
  assert.throws(() => switchStoryEditorMode({ ...editor, storyText: passage + " extra" }, "boxes"), /Reduce the story/);
  assert.equal(editor.storyText, passage, "Switching must not mutate the saved source story");
  console.log("PASS specific learner field errors and loss-free story view changes, including overlong text protection");

  const starts = [];
  const requestContext = vm.createContext({ assessmentStartPendingRef: { current: false }, assessmentStartConfirmation: null, classReadonly:false, assessments:[], PERIODS:["BoSY","MoSY","EoSY"], periodEligibility,
    setAssessmentStartConfirmation: value => starts.push(value) });
  const requestBegin = page.indexOf("  const requestAssessmentStart =");
  const requestEnd = page.indexOf("  const startAssessment =", requestBegin);
  vm.runInContext(page.slice(requestBegin, requestEnd) + "\nglobalThis.request = requestAssessmentStart;", requestContext);
  requestContext.request({ id: 406 });
  requestContext.assessments.push({learner_id:406,assessment_period:"BoSY",is_completed:true});
  requestContext.request({ id: 406 });
  requestContext.assessments.push({learner_id:406,assessment_period:"MoSY",is_completed:true});
  requestContext.request({ id: 406 });
  assert.equal(starts.length, 3);
  assert.deepEqual(starts.map(value => value.period), ["BoSY", "MoSY", "EoSY"]);
  requestContext.assessmentStartPendingRef.current = true;
  requestContext.request({ id: 407 }, "BoSY");
  assert.equal(starts.length, 3);
  assert.equal((page.match(/requestAssessmentStart\(learner\)/g) || []).length, 1, "The single Start action opens the period-selection confirmation");
  assert.match(page, /assessmentStartConfirmation \? <AssessmentStartConfirmation/);

  let mode = "online", probes = 0, poll, cleanup;
  const windowListeners = new Map(), documentListeners = new Map(), offlineStates = [];
  const monitor = vm.createContext({
    detectAssessmentConnectionMode: async () => { probes++; return mode; },
    setIsOffline: value => offlineStates.push(value),
    useEffect: callback => { cleanup = callback(); },
    document: { hidden: false, addEventListener: (type, callback) => documentListeners.set(type, callback), removeEventListener: type => documentListeners.delete(type) },
    window: { addEventListener: (type, callback) => windowListeners.set(type, callback), removeEventListener: type => windowListeners.delete(type),
      setInterval: (callback, interval) => { assert.ok(interval <= 5000); poll = callback; return 1; }, clearInterval: () => { poll = null; } },
  });
  const monitorBegin = page.indexOf("  useEffect(() => {", page.indexOf("  const [isOffline, setIsOffline]"));
  const monitorEnd = page.indexOf("  }, []);", monitorBegin) + "  }, []);".length;
  vm.runInContext(page.slice(monitorBegin, monitorEnd), monitor);
  await new Promise(setImmediate);
  assert.equal(offlineStates.at(-1), false);
  mode = "offline";
  windowListeners.get("offline")();
  await new Promise(setImmediate);
  assert.equal(offlineStates.at(-1), true);
  mode = "online";
  poll();
  await new Promise(setImmediate);
  assert.equal(offlineStates.at(-1), false, "Real reachability changes must be detected without a browser network event");
  monitor.document.hidden = true;
  const previousProbes = probes;
  poll();
  assert.equal(probes, previousProbes, "Hidden pages must not add background connectivity probes");
  cleanup();
  assert.equal(windowListeners.size, 0);
  assert.equal(documentListeners.size, 0);
  assert.equal(poll, null);
  console.log("PASS live connectivity events/polls update offline controls and clean up without hidden-page polling");

  const notices = [], calls = [];
  const addContext = vm.createContext({
    learnerRows: [valid], getLearnerRowErrors, duplicateLearnerRowIds: new Set(), user: { section: "Test" },
    showToast: message => notices.push(message), setLearnerValidationAttempted() {}, setSavingLearner() {},
    api: async (action, request) => { calls.push({ action, body: request.body }); return { learner: { id: 406, lrn: request.body.lrn } }; },
    setLearners() {}, setRecentlyAddedLearnerIds() {}, setLearnerRows() {}, setLearnerForm() {}, setAddLearnerOpen() {},
    blankLearnerRow: id => ({ id }),
  });
  const addBegin = page.indexOf("  const addLearners =");
  const addEnd = page.indexOf("  const deleteLearner =", addBegin);
  vm.runInContext(page.slice(addBegin, addEnd) + "\nglobalThis.add = addLearners;", addContext);
  for (const field of ["lrn", "lastName", "firstName"]) {
    addContext.learnerRows = [{ ...valid, [field]: "" }];
    await addContext.add();
    assert.match(notices.at(-1), new RegExp(getLearnerRowErrors(addContext.learnerRows[0])[field].replace(/\./g, "\\.")));
  }
  assert.equal(calls.length, 0, "Invalid learner rows must never reach online or offline writes");
  addContext.learnerRows = [valid];
  await addContext.add();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.first_name, "TEST");
  assert.equal(calls[0].body.last_name, "LEARNER");
  console.log("PASS Start selects the next eligible period in a confirmation overlay; invalid names/LRN prevent writes and valid learner creation remains active");

  const deleteBegin = page.indexOf("  const deleteLearner =");
  const deleteEnd = page.indexOf("  const toggleLearnerSelection", deleteBegin);
  for (const learnerId of [406, -406]) {
    let context;
    let deletes = 0;
    context = vm.createContext({
      deleteTarget: { id: learnerId, lrn: valid.lrn }, deletingProgress: null, savingScoresheet: false,
      learners: [{ id: learnerId, lrn: valid.lrn }, { id: 407, lrn: "987654321012" }],
      assessments: [{ id: 42, learner_id: learnerId }, { id: 43, learner_id: 407 }],
      scoresheetDrafts: { 42: { remarks: "Deleted learner draft" }, 43: { remarks: "Keep this draft" } },
      process: { env: { NODE_ENV: "production" } },
      api: async () => { deletes++; return { status: "ok", deleted_learner_id: learnerId, deleted_lrn: valid.lrn }; },
      setDeletingProgress: value => { context.deletingProgress = value; },
      setScoresheetDrafts: update => { context.scoresheetDrafts = update(context.scoresheetDrafts); },
      setLearners: update => { context.learners = update(context.learners); },
      setAssessments: update => { context.assessments = update(context.assessments); },
      setDeleteTarget() {}, showToast() {}, window: { setTimeout: callback => callback() },
    });
    vm.runInContext(page.slice(deleteBegin, deleteEnd) + "\nglobalThis.remove = deleteLearner;", context);
    await Promise.all([context.remove(), context.remove()]);
    assert.equal(deletes, 1, "Delete requests must not be duplicated while saving");
    assert.deepEqual(Array.from(context.learners, item => item.id), [407]);
    assert.deepEqual(Array.from(context.assessments, item => item.id), [43]);
    assert.deepEqual(Object.keys(context.scoresheetDrafts), ["43"]);
  }
  assert.match(page, /<DeleteLearnersDialog/);
  assert.doesNotMatch(page, /scoresheetDeleteLearner"/);
  const blockedSaveContext = vm.createContext({ useCallback: callback => callback, api() { throw new Error("A delete in progress must not race a scoresheet write"); },
    finishPendingScoresheetNavigation() {}, scoresheetDrafts: { 42: { remarks: "pending" } }, savingScoresheet: false, deletingProgress: { total: 1 }, showToast() {} });
  const saveBegin = page.indexOf("  const saveScoresheetChanges =");
  const saveEnd = page.indexOf("  /*", page.indexOf("  }, [", saveBegin));
  vm.runInContext(page.slice(saveBegin, saveEnd) + "\nglobalThis.save = saveScoresheetChanges;", blockedSaveContext);
  assert.equal(await blockedSaveContext.save(), false);
  console.log("PASS scoresheet deletion uses the learner identity, cleans associated drafts, retains unrelated rows and works for offline local IDs");

  const overviewRows = [
    { learner: { id: 10, created_at: "2026-10-01T09:00:00Z" } },
    { learner: { id: 2, created_at: "2026-10-09T09:00:00Z" } },
    { learner: { id: "local_learner_1", created_at: "2026-10-10T09:00:00Z" } },
    { learner: { id: 5, createdAt: "2026-10-08T09:00:00Z" } },
    { learner: { id: 8, created_at: "invalid" } },
    { learner: { id: 9, created_at: "2026-10-07T09:00:00Z" } },
    { learner: { id: 3, created_at: "2026-10-09T09:00:00Z" } },
    { learner: { id: 1 } },
  ].map(row => ({ ...row, hasBosy: true, hasMosy: true, hasEosy: true, profile: "Reading At Grade Level" }));
  const beforeOverview = JSON.stringify(overviewRows);
  const overview = vm.createContext({ dashboardRows: overviewRows, learners: overviewRows.map(row => row.learner), useMemo: callback => callback(), normalizeReadingProfile: value => value });
  const overviewSource = page.slice(page.indexOf("  const latestDashboardRows ="), page.indexOf("  const filteredLearners ="));
  vm.runInContext(overviewSource + "\nglobalThis.preview = latestDashboardRows; globalThis.totals = stats;", overview);
  assert.deepEqual(Array.from(overview.preview, row => row.learner.id), ["local_learner_1", 3, 2, 5, 9]);
  assert.equal(JSON.stringify(overviewRows), beforeOverview, "Limiting the preview cannot sort or truncate the real roster");
  for (const field of ["total", "bosy", "mosy", "eosy", "gradeReady"]) assert.equal(overview.totals[field], 8, `${field} must still count the full roster`);
  const emptyOverview = vm.createContext({ dashboardRows: [], learners: [], useMemo: callback => callback(), normalizeReadingProfile: value => value });
  vm.runInContext(overviewSource + "\nglobalThis.preview = latestDashboardRows;", emptyOverview);
  assert.equal(emptyOverview.preview.length, 0);
  console.log("PASS overview shows the five most recently added learners, supports offline IDs and missing dates, and preserves full-roster totals and order");
})().catch(error => { console.error(error); process.exitCode = 1; });
