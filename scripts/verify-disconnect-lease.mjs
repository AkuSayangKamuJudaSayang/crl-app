import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ASSESSMENT_DISCONNECT_GRACE_MS,
  assessmentPeerLeaseExpired,
  recordAssessmentPeerSeen,
  readAssessmentPeerSeen,
  clearAssessmentPeerSeen,
} from "../lib/assessmentDisconnectLease.mjs";

assert.equal(ASSESSMENT_DISCONNECT_GRACE_MS, 60_000);
const values = new Map();
const store = {
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
  removeItem: key => values.delete(key),
};
const code = "ABC234", start = 1_700_000_000_000;
assert.equal(assessmentPeerLeaseExpired("teacher", code, 0, start, store), false);
assert.equal(recordAssessmentPeerSeen("teacher", code, start, store), true);
assert.equal(readAssessmentPeerSeen("teacher", code, store), start);
assert.equal(assessmentPeerLeaseExpired("teacher", code, 0, start + 59_999, store), false);
assert.equal(assessmentPeerLeaseExpired("teacher", code, 0, start + 60_000, store), true);
recordAssessmentPeerSeen("teacher", code, start + 30_000, store);
assert.equal(assessmentPeerLeaseExpired("teacher", code, 0, start + 89_999, store), false);
assert.equal(assessmentPeerLeaseExpired("teacher", code, 0, start + 90_000, store), true);
assert.equal(readAssessmentPeerSeen("learner", code, store), 0, "Teacher and learner records must be isolated");
assert.equal(assessmentPeerLeaseExpired("learner", code, start, start + 60_000, store), true);
clearAssessmentPeerSeen("teacher", code, store);
assert.equal(readAssessmentPeerSeen("teacher", code, store), 0);
assert.equal(recordAssessmentPeerSeen("teacher", "bad", start, store), false);

const teacher = readFileSync("app/teacher/assessment/AssessmentClient.jsx", "utf8");
const learner = readFileSync("app/learner/LearnerAssessmentPage.jsx", "utf8");
const recovery = readFileSync("components/TeacherAssessmentRecovery.jsx", "utf8");
const server = readFileSync("app/api/assessment/route.js", "utf8");
const offline = readFileSync("app/components/OfflineRuntime.jsx", "utf8");
assert.match(teacher, /assessmentPeerLeaseExpired\("teacher"/);
assert.match(teacher, /auto_timeout: true/);
assert.match(learner, /assessmentPeerLeaseExpired\("learner"/);
assert.match(recovery, /assessmentPeerLeaseExpired\("teacher"/);
assert.match(recovery, /enqueueOfflineMutation/);
assert.match(server, /const automaticTimeout = body\?\.auto_timeout === true/);
assert.match(server, /learner: \{ classSectionId: owner.classSectionId \}/);
assert.match(server, /isCompleted: false/);
assert.match(offline, /body\?\.auto_timeout === true/);
console.log("PASS 60-second persistent peer lease, role isolation and cross-runtime timeout integration");
