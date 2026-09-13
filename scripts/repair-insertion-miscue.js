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
  const oldGuard = /if \(\(nextType === "Insertion" \|\| nextType === "Substitution"\) && !nextMisreadWord\) \{\s*setSelectedMiscueType\(nextType\);\s*return;\s*\}/;
  if (oldGuard.test(source)) {
    source = source.replace(
      oldGuard,
      `if (nextType === "Substitution" && !nextMisreadWord) {\n      setSelectedMiscueType(nextType);\n      return;\n    }`
    );
  }

  const oldInsertionHandler = /setSelectedMiscueType\(label\);\s*if\(label==='Reversion'\)\{\s*setMiscueDrawerOpen\(false\);\s*setReversionSourceWord\(Number\(selectedPassageWord\)\);\s*setReversionSelecting\(true\);\s*setError\(""\);\s*return;\s*\}\s*if\(label!=='Insertion'&&label!=='Substitution'\)void recordPassageMiscue\(selectedPassageWord,label,''\);/;
  if (oldInsertionHandler.test(source)) {
    source = source.replace(
      oldInsertionHandler,
      `setSelectedMiscueType(label);\n                    if(label==='Reversion'){\n                      setMiscueDrawerOpen(false);\n                      setReversionSourceWord(Number(selectedPassageWord));\n                      setReversionSelecting(true);\n                      setError("");\n                      return;\n                    }\n                    if(label==='Insertion'){\n                      setMiscueDrawerOpen(false);\n                      setSelectedMiscueType(null);\n                      setMisreadWord("");\n                      void recordPassageMiscue(selectedPassageWord,'Insertion','');\n                      return;\n                    }\n                    if(label!=='Substitution')void recordPassageMiscue(selectedPassageWord,label,'');`
    );
  }

  source = source.replace(
    /\(selectedMiscueType==='Insertion'\|\|selectedMiscueType==='Substitution'\) && \(/g,
    `(selectedMiscueType==='Substitution') && (`
  );
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
  "Applied CRL insertion miscue repair: Insertion records immediately; Substitution keeps its text prompt."
);
