const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

(async () => {
  const source = fs.readFileSync("app/components/OfflineSyncPrompt.jsx", "utf8")
    .replace(/^import[^;]+;\s*/gm, "")
    .replace("export default function", "function")
    .replace("<style jsx>", "<style>");
  const { code } = await require("next/dist/build/swc").transform(source, {
    filename: "sync-prompt-scope.jsx", jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "classic" } } },
  });
  const context = vm.createContext({ React, useEffect() {},
    useState() {
      const values = [context.status, false, Boolean(context.minimized),
        context.quietAssessmentCodes || [], Boolean(context.assessmentActive)];
      return [values[context.hookIndex++], () => {}];
    },
    usePathname: () => context.pathname });
  vm.runInContext(code, context);
  const Prompt = () => {
    context.hookIndex = 0;
    return React.createElement(context.OfflineSyncPrompt);
  };
  const markup = () => renderToStaticMarkup(React.createElement(Prompt));
  for (const phase of ["syncing", "waiting", "blocked", "success"]) {
    context.status = { phase, total: 5, completed: 0, current: { title: "End assessment", details: ["Private learner test fixture", "BoSY"] }, message: "Test synchronization state." };
    for (const path of ["/", "/login", "/login/verify", "/learner", "/admin", "/teacher-extra", "/teacher/assessment", "/teacher/assessment/anything", undefined]) {
      context.pathname = path;
      assert.equal(markup(), "", `${phase} status must not reveal assessment details on ${path}`);
    }
    context.assessmentActive=true;context.pathname="/teacher";
    assert.equal(markup(),"","Embedded offline assessments must suppress the dashboard prompt");
    context.assessmentActive=false;
    for (const path of ["/teacher"]) {
      context.pathname = path;
      const output = markup();
      assert.ok(output.includes('aria-label="Offline synchronization"'));
      assert.ok(output.includes("Private learner test fixture"));
      if (phase === "blocked") assert.ok(output.includes("Sync needs attention"));
    }
  }
  context.pathname = "/teacher";
  context.assessmentActive = false;
  context.minimized = true;
  context.status = { phase:"syncing", total:5, completed:2, current:{
    title:"Pending sample",details:["Private learner fixture"]}, message:"Background synchronization" };
  assert(markup().includes('aria-label="Expand synchronization details"'),
    "A minimized green sync prompt must retain an accessible expand control");
  assert(!markup().includes("Private learner fixture"),
    "The minimized sync prompt must not expose details or obstruct the teacher");
  context.minimized = false;
  assert(markup().includes('aria-label="Minimize synchronization notification"'),
    "The expanded sync prompt must offer a minimize control");

  for(const phase of ["syncing","waiting","success"]){
    context.status = { phase, completed:1,total:2,
      current:{title:"Final assessment review",assessmentCode:"DONE123",
        finishedAssessment:false,details:["Synthetic Learner"]},message:"Syncing" };
    context.quietAssessmentCodes = ["DONE123"];
    assert.equal(markup(),"",`${phase} of confirmed completed assessment must not render a sync prompt`);
    context.quietAssessmentCodes = [];
    context.status.current.finishedAssessment = true;
    assert.equal(markup(),"",`${phase} of durably completed offline assessment stays silent after reload`);
  }
  context.status.phase = "blocked";
  assert(markup().includes("Sync needs attention"),
    "A failed sync that requires attention must remain accessible so data is not stranded");
  context.status = { phase:"syncing", total:2,completed:1,
    current:{title:"Add learner",details:["Synthetic entry"]},message:"Syncing" };
  assert(markup().includes("Add learner"),
    "Unrelated teacher changes must continue to show ordinary sync progress");
  assert(source.includes('crl-assessment-silent-sync') &&
    source.includes('sessionStorage.setItem') &&
    fs.readFileSync("app/components/OfflineRuntime.jsx","utf8").includes('finishedAssessment: Boolean(host?.stage === "completed" && host?.ended)'),
    "Completion notice must persist in the tab and offline host journal without clearing the queue");
  assert.ok(!fs.readFileSync("app/layout.jsx", "utf8").includes("OfflineSyncPrompt"), "The public root layout must not mount the teacher prompt");
  assert.ok(fs.readFileSync("app/teacher/layout.jsx", "utf8").includes("<OfflineSyncPrompt />"));
  console.log("PASS every sync state is teacher-only; landing, login, learner and admin pages cannot display queued learner details");
})().catch(error => { console.error(error); process.exitCode = 1; });
