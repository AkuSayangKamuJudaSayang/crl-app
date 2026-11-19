const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { createHash } = require("node:crypto");

(async () => {
  const { offlineAssessmentEvidence, matchesCompletedAssessment } = await import("../lib/offlineAssessmentEvidence.mjs");
  const { DEFAULT_ASSESSMENT_CONTENT } = await import("../lib/assessmentContent.js");
  const catalogue = DEFAULT_ASSESSMENT_CONTENT.BoSY;
  const teacherId = 901;
  const learnerId = 406;
  const date = new Date("2026-11-18T00:00:00Z");
  const draft = {
    _offline_replay: true, restore_expired: true, code: "FIX234", learner_id: learnerId, period: "BoSY", remarks: "Read steadily",
    evidence: {
      letters: catalogue.letters.map((letter, letterIndex) => ({ letter, letterIndex, isCorrect: true })),
      words: catalogue.words.map((word, wordIndex) => ({ word, wordIndex, isCorrect: true })),
      comprehension: Array.from({ length: 6 }, (_, questionIndex) => ({ questionIndex, isCorrect: questionIndex < 5 })),
      miscues: [{ wordIndex: 10, miscueType: "Substitution", misreadWord: "synthetic substitution" }],
      timerSeconds: 42, experienceRating: 4, observationLevel: 3, storyTitle: catalogue.stories[0].title,
    },
  };
  assert.ok(offlineAssessmentEvidence(draft.evidence, catalogue));
  const wrongItem = structuredClone(draft);
  wrongItem.evidence.words[0].word = "unapproved";
  assert.equal(offlineAssessmentEvidence(wrongItem.evidence, catalogue), null);
  assert.equal(offlineAssessmentEvidence({ ...draft.evidence, miscues: [null] }), null);

  const expiredHost = { id: 11, code: draft.code, teacherId, learnerId, catalogRevisionId: "revision",
    createdAt: date, updatedAt: date, ended: true, stage: "ended", assessmentSessionId: null,
    currentContent: "Assessment ended after the one-minute connection grace period." };
  const state = { host: { ...expiredHost }, complete: [], writes: 0 };
  const tx = {
    $queryRaw: async () => [],
    learner: { findFirst: async ({ where }) => where.id === learnerId && where.teacherId === teacherId
      ? { id: learnerId, classSectionId: "section" } : null },
    hostSession: {
      findUnique: async () => state.host,
      count: async () => 0,
      update: async ({ data }) => { Object.assign(state.host, data); state.record.hostSessions = [state.host]; },
    },
    assessmentLibraryRevision: { findUnique: async () => ({ period: "BoSY" }) },
    assessmentSession: {
      findMany: async ({ where }) => {
        assert.deepEqual(JSON.parse(JSON.stringify(where)), { learnerId, teacherId, assessmentPeriod: "BoSY", isCompleted: true });
        return state.complete;
      },
      create: async ({ data }) => {
        state.writes++;
        assert.equal(data.dateAdministered, date);
        return (state.record = { ...data, id: 77, wordResults: [], passageMiscues: [] });
      },
      update: async ({ data }) => { Object.assign(state.record, data); state.complete = [state.record]; },
    },
    letterTaskResult: { createMany: async ({ data }) => { state.record.letterResults = data; } },
    wordTaskResult: { createMany: async ({ data }) => { state.record.wordResults = data; } },
    sessionMetrics: { create: async ({ data }) => { state.record.sessionMetrics = data; } },
  };
  const route = fs.readFileSync("app/api/assessment/route.js", "utf8");
  const start = route.indexOf("async function reconcileOfflineAssessment(");
  const end = route.indexOf("async function completeEarlyTermination(", start);
  assert.ok(start > 0 && end > start);
  const context = vm.createContext({ prisma: { ...tx, $transaction: async fn => fn(tx) },
    offlineAssessmentEvidence, matchesCompletedAssessment, normalizeCode: key => key.trim().toUpperCase(),
    lockClass: async () => ({ schoolYear: { id: "year" } }), responseJson: (body, status = 200) => ({ body, status }),
    resolveStartPolicy: async () => ({ period: "BoSY", revisionId: "revision" }),
    getLiveAssessmentContent: async () => catalogue,
    replacePassageMiscues: async (_, id, rows) => { state.record.passageMiscues = rows; },
    replaceComprehensionResults: async (_, id, rows) => { state.record.comprehensionResults = rows; },
    calculateMetrics: async (_, id) => {
      assert.equal(id,77);
      assert.equal(state.record.letterResults.length,10);
      assert.equal(state.record.sessionMetrics.experienceRating,4);
      assert.equal(state.record.sessionMetrics.remarks,"Read steadily");
      return { classification: "Expected CRLA classification" };
    },
  });
  vm.runInContext(route.slice(start,end),context);
  const reconcile = body => context.reconcileOfflineAssessment(teacherId, body);
  assert.equal((await reconcile({ ...draft, restore_expired: false })).status,409);
  assert.equal((await reconcile(wrongItem)).status,409);
  state.host = { ...expiredHost, currentContent: "Assessment session ended by teacher." };
  assert.equal((await reconcile(draft)).status,409,"Manual cancellation cannot be restored");
  state.host = { ...expiredHost, teacherId: 902 };
  assert.equal((await reconcile(draft)).status,409,"Foreign code is not disclosed or changed");
  assert.equal(state.writes,0);
  state.host = { ...expiredHost };
  const recovered = await reconcile(draft);
  assert.equal(recovered.status,200);
  assert.equal(recovered.body.duplicate,false);
  assert.equal(recovered.body.assessment_session_id,77);
  assert.equal(state.host.ended,true);
  assert.equal(state.host.stage,"completed");
  assert.equal(state.record.isCompleted,true);
  assert.equal(state.record.sessionMetrics.timerSeconds,42);
  assert.equal(state.record.passageMiscues[0].wordIndex,10);
  const replay = await reconcile(draft);
  assert.equal(replay.body.duplicate,true);
  const sameScoreDifferentItem = structuredClone(draft);
  sameScoreDifferentItem.evidence.comprehension[0].isCorrect = false;
  sameScoreDifferentItem.evidence.comprehension[5].isCorrect = true;
  assert.equal((await reconcile(sameScoreDifferentItem)).status,409);
  assert.equal(state.writes,1);
  console.log("PASS owned timeout recovery writes complete evidence once, retries match exact answers, and manual cancellation, foreign codes and conflicting scores stay protected");

  const reportSource = fs.readFileSync("app/api/public/report/route.js", "utf8")
    .replace(/^import .*?;\s*$/gm,"").replace(/^export /gm,"");
  const receipts = new Set(), reports = [];
  let lock = Promise.resolve();
  const reportDb = {
    systemState: {
      findUnique: async ({where}) => receipts.has(where.key) || null,
      create: async ({data}) => receipts.add(data.key),
    },
    bugReport: { create: async ({data}) => reports.push(data) },
    $queryRaw: async () => [],
    $transaction: work => {
      const result = lock.then(() => work(reportDb));
      lock = result.catch(() => {});
      return result;
    },
  };
  let actor = {id:teacherId,role:"teacher",schoolId:"900001"};
  const reportContext = vm.createContext({ createHash, prisma:reportDb, NextResponse:Response,
    getAuthenticatedUser:async()=>actor, getCoordinatorUser:async()=>null, enforceSensitiveRate:async()=>null,
    logSecureError:(...args)=>{throw new Error("Unexpected report error: "+args.map(String).join(" "));},
  });
  vm.runInContext(reportSource,reportContext);
  const reportPayload = { type:"bug", teacher_submission_id:"4df89cd2-3a92-420a-aed2-bc7b7daf5617", message:"Synthetic report" };
  const submitReport = (ip) => reportContext.POST(new Request("https://crl.test/api/public/report", {
    method:"POST", headers:{"x-forwarded-for":ip}, body:JSON.stringify(reportPayload),
  }));
  const responses = await Promise.all([submitReport("192.0.2.2"),submitReport("192.0.2.3")]);
  assert.ok(responses.every(response=>response.ok));
  assert.equal(reports.length,1);
  assert.equal(reports[0].schoolId,"900001");
  actor = null;
  assert.equal((await submitReport("192.0.2.4")).status,401);
  assert.equal(reports.length,1);
  console.log("PASS teacher offline-report retries create one same-school submission, and unsigned requests cannot replay");
})().catch(error => { console.error(error); process.exitCode = 1; });
