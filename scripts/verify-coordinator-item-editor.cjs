"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");

(async () => {
  const {
    cleanCoordinatorItem, coordinatorEntryRowErrors, coordinatorItemIdentity,
    applyCoordinatorItemRows,
  } = await import("../lib/coordinatorAssessmentItems.mjs");
  const {
    getAssessmentContentIssues, getAssessmentPublicationIssues,
    getAssessmentSelectionStatus, selectAssessmentContentForRun,
  } = await import("../lib/assessmentContent.js");

  assert.equal(cleanCoordinatorItem("letters", "m"), "M");
  assert.equal(cleanCoordinatorItem("letters", "qwerty"), "Q");
  assert.equal(cleanCoordinatorItem("letters", "3-m "), "M");
  assert.equal(cleanCoordinatorItem("letters", "7"), "");
  assert.equal(cleanCoordinatorItem("words", "  Rainbow River!"), "RainbowRiver");
  assert.equal(cleanCoordinatorItem("words", "abcdefghijklmnopq"), "abcdefghijklmno");
  assert.equal(cleanCoordinatorItem("words", "Lion-Fish"), "LionFish");
  assert.equal(coordinatorItemIdentity("  MoOn  "), "moon");

  const letters = ["M", "S", "A", "L", "O", "B", "E", "U", "R", "T"];
  const words = ["clap","jump","eat","drink","stand","dance","fly","pencil","basket","helmet"];
  const allLetters = [...letters, "P", "D", "K"];
  const allWords = [...words, "strawberries", "environmental", "Mockingbird"];
  const stories = ["First", "Second", "Third"].map(title => ({
    title, text: Array.from({length:100}, (_, i) => `word${i+1}`).join(" "),
    questions: Array.from({length:6}, (_, i) => ({
      text: `What happened ${i+1}?`, possibleAnswer: "The character helped.",
    })),
  }));

  assert.equal(coordinatorEntryRowErrors("letters", ["M"], ["m"])[0],
    "This letter already exists.", "Saved duplicates compare case-insensitively");
  assert.deepEqual(coordinatorEntryRowErrors("letters", ["Q", "q", "Z"], []),
    ["This item is already entered in another row.",
     "Enter exactly one uppercase letter (A–Z).", ""],
    "Per-row validation catches both invalid case and repeated rows");
  assert.deepEqual(coordinatorEntryRowErrors("letters", ["M", "M"], []),
    ["This item is already entered in another row.",
     "This item is already entered in another row."]);
  assert.deepEqual(coordinatorEntryRowErrors("words", ["tree", "TREE"], []),
    ["This item is already entered in another row.",
     "This item is already entered in another row."]);
  assert.equal(coordinatorEntryRowErrors("words", ["MOON"], ["moon"])[0],
    "This word already exists.");
  assert.equal(coordinatorEntryRowErrors("words", ["abcdefghijklmnop"], [])[0],
    "Use one word of up to 15 letters (A–Z).");
  assert.equal(coordinatorEntryRowErrors("words", ["abcdefghijklmnO"], [])[0], "");
  assert.equal(coordinatorEntryRowErrors("words", ["two words"], [])[0],
    "Use one word of up to 15 letters (A–Z).");
  assert.equal(coordinatorEntryRowErrors("words", ["M"], ["m"], 0)[0], "",
    "Edit of existing row is not treated as a duplicate of itself");

  const baseline = {
    content: {letters, words, stories}, modes:{letters:"fixed",words:"fixed",stories:"fixed"},
    defaults: {letters:letters.slice(),words:words.slice(),stories:["First","Second"]},
  };
  const before=JSON.stringify(baseline);
  const expanded=applyCoordinatorItemRows(baseline, "letters", ["p", "k"]);
  assert.deepEqual(expanded.content.letters.slice(-2), ["P","K"]);
  assert.equal(JSON.stringify(baseline), before, "Unsaved editor cannot mutate published catalog");
  assert.throws(()=>applyCoordinatorItemRows(baseline,"letters",["Q","q"]),/already entered/);
  assert.throws(()=>applyCoordinatorItemRows(baseline,"words",["MOON","moon"]),/already entered/);
  assert.throws(()=>applyCoordinatorItemRows(baseline,"letters",["M"]),/already exists/);
  const updated=applyCoordinatorItemRows(baseline,"letters",["k"], 0);
  assert.equal(updated.content.letters[0],"K");
  assert.equal(updated.defaults.letters[0],"K");
  assert.equal(baseline.content.letters[0],"M");
  assert.equal(baseline.defaults.letters[0],"M");
  const wordUpdate=applyCoordinatorItemRows(baseline,"words",["Environmental"],1);
  assert.equal(wordUpdate.content.words[1],"Environmental");
  assert.equal(wordUpdate.defaults.words[1],"Environmental");

  assert.equal(getAssessmentContentIssues({letters,words:[...words.slice(0,9),"abcdefghijklmno"],stories}).filter(i=>i.category==="words").length,0,
    "Exactly 15-character words are valid");
  assert(getAssessmentContentIssues({letters,words:[...words.slice(0,9),"abcdefghijklmnop"],stories}).some(i=>i.category==="words"),
    "Words with 16 letters are rejected");
  assert.equal(getAssessmentSelectionStatus(baseline.content,baseline.modes,baseline.defaults,"letters").issue,null);
  assert.equal(getAssessmentSelectionStatus(baseline.content,baseline.modes,baseline.defaults,"words").issue,null);
  assert.equal(getAssessmentSelectionStatus(baseline.content,baseline.modes,baseline.defaults,"stories").issue,null);

  const tooFew={...baseline.defaults,letters:letters.slice(0,9)};
  const tooMany={...baseline.defaults,letters:[...letters,"P"]};
  assert.match(getAssessmentSelectionStatus({...baseline.content,letters:allLetters},baseline.modes,tooFew,"letters").issue,/exactly 10/);
  assert.match(getAssessmentSelectionStatus({...baseline.content,letters:allLetters},baseline.modes,tooMany,"letters").issue,/exactly 10/);
  assert(getAssessmentPublicationIssues({...baseline.content,letters:allLetters},baseline.modes,tooMany).some(i=>i.category==="letters"),
    "A fixed publication with 11 defaults must be rejected");
  assert(getAssessmentPublicationIssues({...baseline.content,stories},baseline.modes,
    {...baseline.defaults,stories:["First"]}).some(i=>i.category==="stories"),
    "Fixed story choices must be exactly two");
  assert(getAssessmentPublicationIssues({...baseline.content,letters:[...letters, "m"]},
    baseline.modes,baseline.defaults).some(i=>i.category==="letters"),
    "Case-insensitive duplicate in the published pool is rejected");
  assert(getAssessmentPublicationIssues({...baseline.content,words:[...words,"HELMET"]},
    baseline.modes,baseline.defaults).some(i=>i.category==="words"),
    "Case-insensitive duplicate word in the published pool is rejected");

  const pool={letters:allLetters, words:allWords, stories};
  const fixed={letters:"fixed",words:"fixed",stories:"fixed"};
  const random={letters:"random",words:"random",stories:"random"};
  const exactDefaults={letters:["P",...letters.slice(0,9)],words:allWords.slice(3,13),stories:["Second","Third"]};
  const fixedRun=selectAssessmentContentForRun(pool,fixed,"AB12CD",exactDefaults);
  assert.deepEqual(fixedRun.letters,allLetters.filter(v=>exactDefaults.letters.includes(v)));
  assert.deepEqual(fixedRun.words,allWords.filter(v=>exactDefaults.words.includes(v)));
  assert.deepEqual(fixedRun.stories.map(story=>story.title),["Second","Third"]);
  for(const seed of ["AB12CD","ZY98XY","QQ12DD"]){
    const run=selectAssessmentContentForRun(pool,random,seed,exactDefaults);
    assert.deepEqual([run.letters.length,run.words.length,run.stories.length],[10,10,2],
      "Every online/offline seeded run administers only the required counts");
    assert(run.letters.every(letter=>pool.letters.includes(letter)));
    assert(run.words.every(word=>pool.words.includes(word)));
    assert(run.stories.every(story=>pool.stories.includes(story)));
    assert.deepEqual(run,selectAssessmentContentForRun(pool,random,seed,exactDefaults),
      "An active run must preserve its own random order");
  }
  assert.deepEqual(selectAssessmentContentForRun(pool,fixed,"AB12CD",exactDefaults),fixedRun,
    "An untouched selection is stable between assessments");

  const ui=fs.readFileSync("components/AssessmentLibrary.jsx","utf8");
  const css=fs.readFileSync("components/Coordinator.module.css","utf8");
  assert(!ui.includes("Add assessment items below, one per line."));
  assert(!ui.includes("<textarea rows={5}"),"Letter/word editor has no multiline input");
  assert(ui.includes("coordinatorEntryRowErrors(") && ui.includes("rowErrors[rowIndex]"),
    "Duplicate warnings display immediately under their inputs");
  assert(ui.includes("maxLength={category==='letters'?1:15}"));
  assert(ui.includes("cleanCoordinatorItem(category,event.target.value)"));
  assert(ui.includes("+ Add another row"));
  assert(ui.includes("editor.rows.filter((_,i)=>i!==rowIndex)"),"Unsaved extra rows are removable");
  assert(ui.includes("Select exactly {ASSESSMENT_CONTENT_REQUIREMENTS[category]}"));
  assert(ui.includes("setDraft({...current,defaults:") &&
    ui.includes("onDiscard={()=>{"),"Unsaved defaults remain local until publication");
  assert(ui.includes("api('coordinator_publish'") && ui.includes("expected_revision:"),
    "Publication still uses optimistic revision and active-assessment locks");
  // ClassDialog portals to document.body, not under the coordinator panel.
  // Input and Remove must share one centered flex row regardless of warning
  // text, and the layout must not depend on an ancestor .panel selector.
  assert(ui.includes('className={styles.assessmentEntryLabel} htmlFor='),
    "Each item retains an accessible, explicitly associated label");
  assert(ui.includes('className={styles.assessmentEntryControls}'),
    "Each input and its Remove button belong to the same control row");
  assert(ui.indexOf('className={styles.assessmentEntryControls}') <
    ui.indexOf('aria-label={`Remove'),
    "Remove is inside the shared controls, never above the input");
  assert(ui.includes('</div>\n   {rowErrors[rowIndex]&&<small'),
    "Inline validation appears below the controls, not beside Remove");
  assert(/\\.assessmentEntryRows\\s*\\{[^}]*align-items:center/.test(css),
    "All letter and word rows are centered in the dialog");
  assert(/\\.assessmentEntryControls\\s*\\{[^}]*align-items:center;justify-content:center/.test(css),
    "Inputs and Remove buttons must share a centered vertical alignment");
  assert(/\\.assessmentEntryControls>\\.secondary\\s*\\{[^}]*align-items:center;justify-content:center/.test(css),
    "Remove buttons use the same line and vertical center as inputs");
  assert(/\\.assessmentEntryControls input\\.assessmentLetterInput\\s*\\{[^}]*width:68px!important/.test(css),
    "Letter inputs stay compact within the body-portal dialog");
  assert(/\\.assessmentEntryControls input\\.assessmentWordInput\\s*\\{[^}]*width:260px!important/.test(css),
    "Word inputs stay compact within the body-portal dialog");
  assert(!css.includes(".panel .assessmentEntryLabel") &&
    !css.includes(".panel .assessmentEntryRow"),
    "Editor styles cannot depend on the coordinator panel outside the dialog portal");
  assert(css.includes("@media(max-width:480px)") &&
    css.includes("flex:1 1 0;width:auto!important;max-width:100%"),
    "Inputs shrink safely alongside Remove at tablet/mobile widths");
  assert(css.includes("input[type=checkbox]{appearance:auto;width:23px"));
  assert(fs.readFileSync("lib/coordinatorPolicy.js","utf8").includes("await assertLibraryEditable(tx)"),
    "Publication must remain blocked while an assessment is in progress");

  console.log("PASS row-based coordinator letter and word editor, uppercase input, 15-letter maximum, live existing/draft duplicates, exact fixed defaults, unsaved isolation, 10/10/2 fixed/random/seeded live content");
})().catch(error=>{console.error(error);process.exitCode=1;});
