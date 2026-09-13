const fs = require("node:fs");
const path = require("node:path");

function replaceOnce(source, oldValue, newValue, label) {
  const count = source.split(oldValue).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: expected exactly 1 match, found ${count}`);
  }
  return source.replace(oldValue, newValue);
}

/* ========================================================================== */
/* ASSESSMENT FLOW REPAIR                                                     */
/* ========================================================================== */
const routeTarget = path.join(process.cwd(), "app", "api", "assessment", "route.js");
let routeSource = fs.readFileSync(routeTarget, "utf8");
const flowMarker = "// CRL_ASSESSMENT_FLOW_FULL_SEQUENCE";

if (!routeSource.includes(flowMarker)) {
  let patched = routeSource;

  const task1EarlyStop = `        const task1Zero =\n          Number(scoring?.task1Score ?? 0) === 0 &&\n          Number(scoring?.task2Score ?? 0) === 0;`;
  if (!patched.includes(task1EarlyStop)) {
    throw new Error("Expected Task 1 early-stop guard was not found; refusing to patch an unexpected route version.");
  }
  patched = patched.replace(task1EarlyStop, "        const task1Zero = false;");

  patched = patched.replaceAll(
    `      hardTerminate:\n        true,\n      hardTerminateStage:\n        "letter",`,
    `      hardTerminate:\n        false,\n      hardTerminateStage:\n        null,`
  );
  patched = patched.replaceAll(
    `      hardTerminate:\n        true,\n      hardTerminateStage:\n        "word",`,
    `      hardTerminate:\n        false,\n      hardTerminateStage:\n        null,`
  );

  const classificationGuard = `\n  if (\n    part1.hardTerminate\n  ) {\n    return part1.profile;\n  }\n`;
  if (!patched.includes(classificationGuard)) {
    throw new Error("Expected classification hard-termination guard was not found.");
  }
  patched = patched.replace(classificationGuard, "\n");

  const metricsStart = patched.indexOf("  const isPart1Task1EarlyStop =");
  const passageStart = patched.indexOf("  const passageStarted =", metricsStart);
  const passageEnd = patched.indexOf("\n  );", passageStart);
  if (metricsStart < 0 || passageStart < 0 || passageEnd < 0) {
    throw new Error("Expected early-stop metrics block was not found.");
  }

  const metricsReplacement = `  const timerSeconds =\n    existingSessionMetrics?.timerSeconds ??\n    null;\n\n  const wordsRead = Math.max(\n    0,\n    passageWordCount -\n      totalMiscues\n  );\n\n  const miscueAccuracy = Number(\n    wordsRead.toFixed(2)\n  );\n\n  const passageStarted =\n    miscues.length > 0 ||\n    comprehension.length > 0 ||\n    timerSeconds !== null;`;

  patched =
    patched.slice(0, metricsStart) +
    metricsReplacement +
    patched.slice(passageEnd + 5);

  const hardcodedPassageStart = `                      currentContent:\n                        'What must Para look for?',\n                      storyTitle:\n                        "Para the Parrot",`;
  if (!patched.includes(hardcodedPassageStart)) {
    throw new Error("Expected hardcoded comprehension handoff was not found.");
  }
  patched = patched.replace(
    hardcodedPassageStart,
    `                      currentContent:\n                        String(host.storyTitle || "")\n                          .trim()\n                          .toLowerCase()\n                          .includes("a day in the fields")\n                          ? "What is the job of Dulnuwan?"\n                          : "What must Para look for?",\n                      storyTitle:\n                        host.storyTitle || "Para the Parrot",`
  );

  const tag = `\n${flowMarker}\n`;
  patched = patched.replace("\nexport async function GET(", `${tag}\nexport async function GET(`);
  fs.writeFileSync(routeTarget, patched, "utf8");
  console.log("Applied CRL assessment flow: Letter Sounds -> Word Recognition -> Story Choice -> Passage -> Comprehension -> Learner Experience -> Final Results.");
}

/* ========================================================================== */
/* PASSAGE MISCUE MARKING REPAIR                                              */
/* ========================================================================== */
const clientTarget = path.join(process.cwd(), "app", "teacher", "assessment", "AssessmentClient.jsx");
const clientMarker = "// CRL_MISCUE_MARKING_REPAIR";
let clientSource = fs.readFileSync(clientTarget, "utf8");

if (!clientSource.includes(clientMarker)) {
  let patched = clientSource;

  patched = replaceOnce(
    patched,
    `        if ((nextType === "Insertion" || nextType === "Substitution") && !nextMisreadWord) {`,
    `        if (nextType === "Substitution" && !nextMisreadWord) {`,
    "Miscue validation"
  );

  patched = replaceOnce(
    patched,
    `          Insertion: {\n            background: "#dff1ff",\n            color: "#1766a9",\n            border: "#74b8ea",\n          },\n          Omission: {`,
    `          Insertion: {\n            background: "#dff1ff",\n            color: "#1766a9",\n            border: "#74b8ea",\n          },\n          Reversion: {\n            background: "#fff1df",\n            color: "#d97706",\n            border: "#f1ad5a",\n          },\n          Omission: {`,
    "Miscue palette"
  );

  const oldMarkerStyle = `            const markerStyle = annotation?.miscueType === "Omission"\n              ? { textDecoration: "line-through 3px #d12d3f", textDecorationColor: "#d12d3f" }\n              : annotation?.miscueType === "Repetition"\n                ? { textDecoration: "underline double 3px #d12d3f", textUnderlineOffset: "5px", textDecorationColor: "#d12d3f" }\n                : annotation?.miscueType === "Substitution"\n                  ? { textDecoration: "underline 3px #d12d3f", textUnderlineOffset: "5px", textDecorationColor: "#d12d3f" }\n                  : annotation?.miscueType === "SelfCorrection"\n                    ? { textDecoration: "underline 2px #2a9a59", textUnderlineOffset: "4px", textDecorationColor: "#2a9a59" }\n                    : annotation?.miscueType === "Reversion"\n                      ? { textDecoration: "underline 2px #d12d3f", textUnderlineOffset: "4px", textDecorationColor: "#d12d3f" }\n                      : {};`;
  patched = replaceOnce(
    patched,
    oldMarkerStyle,
    `            const markerStyle = annotation?.miscueType === "Omission"\n              ? {}\n              : annotation?.miscueType === "Repetition"\n                ? { textDecoration: "underline double 3px #d12d3f", textUnderlineOffset: "5px", textDecorationColor: "#d12d3f" }\n                : annotation?.miscueType === "Substitution"\n                  ? { textDecoration: "underline 3px #d12d3f", textUnderlineOffset: "5px", textDecorationColor: "#d12d3f" }\n                  : annotation?.miscueType === "SelfCorrection"\n                    ? { textDecoration: "underline 2px #2a9a59", textUnderlineOffset: "4px", textDecorationColor: "#2a9a59" }\n                    : {};`,
    "Miscue marker style"
  );

  const oldMarkerSpan = `{annotation && (markerGlyph || ((annotation.miscueType === "Insertion" || annotation.miscueType === "Substitution") && annotation.misreadWord)) && (\n                  <span\n                    aria-hidden="true"\n                    style={{\n                      position: "absolute",\n                      top: "-16px",\n                      left: "50%",\n                      transform: "translateX(-50%)",\n                      color: annotation.miscueType === "SelfCorrection" ? "#2a9a59" : "#d12d3f",\n                      fontSize: annotation.miscueType === "Reversion" ? "12px" : "16px",\n                      lineHeight: 1,\n                      fontWeight: 950,\n                      whiteSpace: "nowrap",\n                      pointerEvents: "none",\n                    }}\n                  >\n                    {markerGlyph}\n                    {(annotation.miscueType === "Insertion" || annotation.miscueType === "Substitution") && annotation.misreadWord ? (\n                      <span style={{ marginLeft: "3px", fontSize: "10px", fontWeight: 900 }}>{annotation.misreadWord}</span>\n                    ) : null}\n                  </span>\n                )}\n                {token}`;
  patched = replaceOnce(
    patched,
    oldMarkerSpan,
    `{annotation && (markerGlyph || ((annotation.miscueType === "Substitution") && annotation.misreadWord)) && (\n                  <span\n                    aria-hidden="true"\n                    style={{\n                      position: "absolute",\n                      top: annotation.miscueType === "Insertion" ? "auto" : "-16px",\n                      bottom: annotation.miscueType === "Insertion" ? "-7px" : "auto",\n                      left: annotation.miscueType === "Insertion" ? "4px" : "50%",\n                      transform: annotation.miscueType === "Insertion" ? "none" : "translateX(-50%)",\n                      color: annotation.miscueType === "SelfCorrection" ? "#2a9a59" : annotation.miscueType === "Reversion" ? "#d97706" : "#d12d3f",\n                      fontSize: annotation.miscueType === "Reversion" ? "12px" : "16px",\n                      lineHeight: 1,\n                      fontWeight: 950,\n                      whiteSpace: "nowrap",\n                      pointerEvents: "none",\n                    }}\n                  >\n                    {markerGlyph}\n                    {annotation.miscueType === "Substitution" && annotation.misreadWord ? (\n                      <span style={{ marginLeft: "3px", fontSize: "10px", fontWeight: 900 }}>{annotation.misreadWord}</span>\n                    ) : null}\n                  </span>\n                )}\n                <span className={annotation?.miscueType === "Omission" ? "crlOmissionWord" : undefined}>{token}</span>`,
    "Miscue marker glyph"
  );

  const oldDrawerEntryCondition = `              {(selectedMiscueType==='Insertion'||selectedMiscueType==='Substitution') && (`;
  patched = replaceOnce(
    patched,
    oldDrawerEntryCondition,
    `              {selectedMiscueType==='Substitution' && (`,
    "Miscue input condition"
  );

  const oldDrawerClick = `                    if(label!=='Insertion'&&label!=='Substitution')void recordPassageMiscue(selectedPassageWord,label,'');`;
  patched = replaceOnce(
    patched,
    oldDrawerClick,
    `                    if(label==='Insertion') {\n                      void recordPassageMiscue(selectedPassageWord,'Insertion','');\n                      return;\n                    }\n                    if(label!=='Substitution')void recordPassageMiscue(selectedPassageWord,label,'');`,
    "Insertion immediate apply"
  );

  const oldReversionPalette = `['Reversion','Word or group of words not read in order','#9c3f8f','#f2e5f2']`;
  patched = replaceOnce(
    patched,
    oldReversionPalette,
    `['Reversion','Word or group of words not read in order','#d97706','#fff1df']`,
    "Reversion drawer palette"
  );

  patched = replaceOnce(
    patched,
    `  reversionSourceWord: {\n    background: "#cfe5f8",\n    color: "#1559a6",\n    borderColor: "#4b91cf",\n    boxShadow: "inset 0 -3px 0 #4b91cf, 0 3px 9px rgba(74,136,190,.18)",\n    cursor: "default",\n  },`,
    `  reversionSourceWord: {\n    background: "#fff1df",\n    color: "#d97706",\n    borderColor: "#f1ad5a",\n    boxShadow: "inset 0 -3px 0 #f1ad5a, 0 3px 9px rgba(217,119,6,.16)",\n    cursor: "default",\n  },`,
    "Reversion source style"
  );

  patched = replaceOnce(
    patched,
    `  reversionExistingMiscueWord: {\n    boxShadow: "inset 0 -2px 0 rgba(180,74,90,.32)",\n  },`,
    `  reversionExistingMiscueWord: {\n    background: "#fff1df",\n    color: "#d97706",\n    borderColor: "#f1ad5a",\n    boxShadow: "inset 0 -2px 0 rgba(217,119,6,.38)",\n  },`,
    "Reversion existing style"
  );

  patched = replaceOnce(
    patched,
    `  reversionWordMarker: {\n    position: "absolute",\n    top: "-15px",\n    left: "50%",\n    transform: "translateX(-50%)",\n    color: "#2f73c9",`,
    `  reversionWordMarker: {\n    position: "absolute",\n    top: "-15px",\n    left: "50%",\n    transform: "translateX(-50%)",\n    color: "#d97706",`,
    "Reversion order marker"
  );

  patched = replaceOnce(
    patched,
    `        .crlPassageWord:hover {`,
    `        .crlOmissionWord {\n          position: relative;\n          display: inline-block;\n        }\n\n        .crlOmissionWord::after {\n          content: "";\n          position: absolute;\n          left: -2px;\n          right: -2px;\n          top: 52%;\n          height: 3px;\n          border-radius: 999px;\n          background: #d12d3f;\n          transform: translateY(-50%) rotate(-18deg);\n          transform-origin: center;\n          pointer-events: none;\n        }\n\n        .crlPassageWord:hover {`,
    "Omission diagonal marking"
  );

  patched = patched.replace("\n</style>\n", "\n</style>\n");
  const clientTag = `\n${clientMarker}\n`;
  const returnAnchor = `\n      <main className="teacherAssessmentPage"`;
  if (!patched.includes(returnAnchor)) {
    throw new Error("Teacher assessment render anchor was not found; refusing to patch an unexpected client version.");
  }
  patched = patched.replace(returnAnchor, `${clientTag}${returnAnchor}`);

  fs.writeFileSync(clientTarget, patched, "utf8");
  console.log("Applied CRL passage miscue markings: insertion arrow, diagonal omission, orange reversion, and no reversion underline.");
}
