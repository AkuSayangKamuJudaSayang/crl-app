const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

(async () => {
  const {
    rememberConductAssessmentReturn,
    consumeConductAssessmentReturn,
    clearConductAssessmentReturn,
  } = await import("../lib/teacherConductReturn.mjs");
  const memory = new Map();
  const storage = {
    getItem: key => memory.get(key) || null,
    setItem: (key, value) => memory.set(key, value),
    removeItem: key => memory.delete(key),
  };
  const catalog = {
    schoolYears: [{ id: "year-a", label: "2026-2027" }],
    sections: [{ id: "section-b", schoolYearId: "year-a", name: "Grade 3" }],
  };
  const scope = { teacherId: 901, schoolYearId: "year-a", sectionId: "section-b" };
  assert.equal(rememberConductAssessmentReturn(scope, storage), true);
  assert.deepEqual(consumeConductAssessmentReturn(901, catalog, storage), {
    schoolYearId: "year-a", sectionId: "section-b",
  });
  assert.equal(consumeConductAssessmentReturn(901, catalog, storage), null,
    "Return scope is single-use; a later intentional tab change cannot revive it");
  const numericCatalog = {
    schoolYears: [{ id: 2026, archivedAt: null }],
    sections: [{ id: 17, schoolYearId: 2026, archivedAt: null }],
  };
  rememberConductAssessmentReturn({ teacherId: 901, schoolYearId: 2026, sectionId: 17 }, storage);
  assert.deepEqual(consumeConductAssessmentReturn(901, numericCatalog, storage),
    { schoolYearId: 2026, sectionId: 17 },
    "Standalone fallback must preserve numeric IDs for strict catalog selection");
  rememberConductAssessmentReturn(scope, storage);
  assert.equal(consumeConductAssessmentReturn(902, catalog, storage), null,
    "A second teacher may not inherit the first teacher's class");
  rememberConductAssessmentReturn(scope, storage);
  assert.equal(consumeConductAssessmentReturn(901, {
    ...catalog, sections: [{ ...catalog.sections[0], archivedAt: new Date().toISOString() }],
  }, storage), null, "An archived class may never be restored as an active roster");
  rememberConductAssessmentReturn(scope, storage);
  assert.equal(consumeConductAssessmentReturn(901, {
    ...catalog, schoolYears: [],
  }, storage), null, "A deleted school year cannot be restored");
  rememberConductAssessmentReturn(scope, storage);
  assert.equal(consumeConductAssessmentReturn(901, catalog, storage, Date.now() + 7 * 60 * 60 * 1000), null,
    "A stale return hint must expire");
  rememberConductAssessmentReturn(scope, storage);
  clearConductAssessmentReturn(storage);
  assert.equal(consumeConductAssessmentReturn(901, catalog, storage), null);

  const source = fs.readFileSync("app/teacher/page.jsx", "utf8");
  const overlay = fs.readFileSync("components/OfflineAssessmentOverlay.jsx", "utf8");
  const assessment = fs.readFileSync("app/teacher/assessment/AssessmentClient.jsx", "utf8");
  assert(!source.includes("router.push(assessmentUrl)"),
    "Normal online assessments must not navigate away and unload the enrolled roster");
  const start = source.indexOf("const assessmentUrl =");
  const end = source.indexOf("setAssessmentStartConfirmation(null);", start);
  assert(start >= 0 && end > start);
  const run = source.slice(start, end);
  assert(run.includes('setActiveTab("conduct")') &&
    run.includes("setBentoOpen(true)") && run.includes("setChoosingClass(false)") &&
    run.includes("setOfflineAssessment({") && run.includes('connectionMode: result?.offline ? "offline" : connectionMode'),
    "Both online and offline starts must use the same retained Conduct workspace");
  assert(overlay.includes('if (!linked && connectionMode === "offline")'),
    "Unpaired online sessions must not be forced into offline device pairing");
  assert(overlay.includes("if (linked && linked.code !== target)"),
    "A paired device must still confirm that it follows the next assessment");
  assert(overlay.includes("initialCode={target}") && overlay.includes("onExit={() => exitRef.current?.()}"),
    "The embedded assessment must retain its code and return through the dashboard callback");
  assert(source.includes("connectionMode={offlineAssessment.connectionMode"),
    "The overlay must be told whether the assessment was started online or offline");
  const exitStart = source.indexOf("onExit={() => {", source.indexOf("{offlineAssessment ? <OfflineAssessmentOverlay"));
  const exitEnd = source.indexOf("}}", exitStart);
  const exit = source.slice(exitStart, exitEnd);
  assert(exit.includes("setOfflineAssessment(null)") &&
    exit.includes('setActiveTab("conduct")') && exit.includes("setBentoOpen(true)") &&
    exit.includes("setChoosingClass(false)") && exit.includes("clearConductAssessmentReturn()"),
    "Save/back must reveal the already-loaded, already-selected enrolled roster immediately");
  assert(source.includes('event?.detail?.assessmentCompleted === true') &&
    source.includes('api("get_assessments")') &&
    !exit.includes("loadData("),
    "After Save, update only assessment status asynchronously; do not refetch learners/classes/activities");
  assert(source.includes("consumeConductAssessmentReturn(user.id, classesData)"),
    "Standalone route fallback must restore the signed-in teacher's validated class scope");
  assert(assessment.includes("Save and Back to Enrolled Learners"),
    "The final save button must accurately describe the destination");

  // Execute the actual overlay's pairing gate with no peer.
  // An unpaired *online* assessment must proceed; offline must still stop.
  const gateStart = overlay.indexOf('      const linked = findLinkedAssessmentPeerSession("teacher");');
  const gateEnd = overlay.indexOf("      try {", gateStart);
  assert(gateStart > 0 && gateEnd > gateStart);
  const gate = overlay.slice(gateStart, gateEnd);
  const testGate = async mode => {
    const errors = [];
    let claims = 0;
    const context = vm.createContext({
      connectionMode: mode,
      target: "SIX234", cancelled: false,
      findLinkedAssessmentPeerSession: () => null,
      setConnectionError: message => errors.push(message),
      claimAssessmentPeerLink: async () => { claims++; return true; },
    });
    await vm.runInContext("(async () => { " + gate + "; return 'proceed'; })()", context);
    return { errors, claims };
  };
  const online = await testGate("online");
  assert.deepEqual(online, { errors: [], claims: 0 },
    "Online assessment may open without an already-paired local peer");
  const offline = await testGate("offline");
  assert.equal(offline.errors.length, 1,
    "Offline assessment continues requiring a linked learner device");

  console.log("PASS online/offline assessment returns to same mounted roster and class; only statuses refresh; offline pairing guards preserved; fallback restore is scoped, one-shot, archive-safe");
})().catch(error => { console.error(error); process.exitCode = 1; });
