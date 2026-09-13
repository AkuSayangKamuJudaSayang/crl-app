const fs = require("node:fs");
const path = require("node:path");

const file = path.join(
  process.cwd(),
  "app",
  "teacher",
  "assessment",
  "AssessmentClient.jsx"
);

let source = fs.readFileSync(file, "utf8");
const marker = "CRL_INSERTION_MISCUE_DIRECT_APPLY_V2";

if (!source.includes(marker)) {
  /* Insertion does not need a learner-spoken text value. Substitution still
   * does. Match the guard semantically so formatting changes do not break
   * startup. */
  const guardPattern = /if \(\(nextType === "Insertion" \|\| nextType === "Substitution"\) && !nextMisreadWord\) \{\s*setSelectedMiscueType\(nextType\);\s*return;\s*\}/;
  if (guardPattern.test(source)) {
    source = source.replace(
      guardPattern,
      `if (nextType === "Substitution" && !nextMisreadWord) {\n          setSelectedMiscueType(nextType);\n          return;\n        }`
    );
  } else if (!/if \(nextType === "Substitution" && !nextMisreadWord\)/.test(source)) {
    throw new Error(
      "Insertion miscue repair: current miscue text guard was not recognized."
    );
  }

  /* Selecting Insertion closes the drawer and records it immediately. */
  const insertionHandlerPattern = /setSelectedMiscueType\(label\);\s*if\(label==='Reversion'\)\{\s*setMiscueDrawerOpen\(false\);\s*setReversionSourceWord\(Number\(selectedPassageWord\)\);\s*setReversionSelecting\(true\);\s*setError\(\"\"\);\s*return;\s*\}\s*if\(label!=='Insertion'&&label!=='Substitution'\)void recordPassageMiscue\(selectedPassageWord,label,''\);/;
  if (insertionHandlerPattern.test(source)) {
    source = source.replace(
      insertionHandlerPattern,
      `setSelectedMiscueType(label);\n                    if(label==='Reversion'){\n                      setMiscueDrawerOpen(false);\n                      setReversionSourceWord(Number(selectedPassageWord));\n                      setReversionSelecting(true);\n                      setError("");\n                      return;\n                    }\n                    if(label==='Insertion'){\n                      setMiscueDrawerOpen(false);\n                      setSelectedMiscueType(null);\n                      setMisreadWord("");\n                      void recordPassageMiscue(selectedPassageWord,'Insertion','');\n                      return;\n                    }\n                    if(label!=='Substitution')void recordPassageMiscue(selectedPassageWord,label,'');`
    );
  } else if (!/if\(label==='Insertion'\)/.test(source)) {
    throw new Error(
      "Insertion miscue repair: current insertion selection handler was not recognized."
    );
  }

  /* The text-entry area is for Substitution only after this repair. */
  source = source.replace(
    /\(selectedMiscueType==='Insertion'\|\|selectedMiscueType==='Substitution'\) && \(/g,
    `(selectedMiscueType==='Substitution') && (`
  );

  /* Keep the existing Substitution input untouched, but remove the insertion
   * wording from it if this exact combined block still exists. */
  source = source.replace(
    /placeholder=\{selectedMiscueType==='Insertion'\?'Enter the word\/sound added':'Enter the substituted word'\}/g,
    `placeholder="Enter the substituted word"`
  );

  const anchor = "const removePassageMiscue =";
  const index = source.indexOf(anchor);
  if (index < 0) {
    throw new Error("Insertion miscue repair: stable marker anchor not found.");
  }

  source = source.slice(0, index) + `/* ${marker} */\n\n` + source.slice(index);
  fs.writeFileSync(file, source, "utf8");
}

console.log(
  "Applied CRL insertion miscue direct-apply repair: Insertion now records immediately without asking what the learner said; Substitution keeps its text prompt."
);
