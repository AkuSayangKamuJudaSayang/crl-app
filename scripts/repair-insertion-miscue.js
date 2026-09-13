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
const marker = "CRL_INSERTION_MISCUE_DIRECT_APPLY_V1";

if (!source.includes(marker)) {
  const guardBefore = `        if ((nextType === "Insertion" || nextType === "Substitution") && !nextMisreadWord) {\n          setSelectedMiscueType(nextType);\n          return;\n        }`;
  const guardAfter = `        if (nextType === "Substitution" && !nextMisreadWord) {\n          setSelectedMiscueType(nextType);\n          return;\n        }`;

  if (!source.includes(guardBefore)) {
    throw new Error(
      "Insertion miscue repair: expected miscue text guard was not found."
    );
  }
  source = source.replace(guardBefore, guardAfter);

  const typeHandlerBefore = `                    setSelectedMiscueType(label);\n                    if(label==='Reversion'){\n                      setMiscueDrawerOpen(false);\n                      setReversionSourceWord(Number(selectedPassageWord));\n                      setReversionSelecting(true);\n                      setError(\"\");\n                      return;\n                    }\n                    if(label!=='Insertion'&&label!=='Substitution')void recordPassageMiscue(selectedPassageWord,label,'');`;
  const typeHandlerAfter = `                    setSelectedMiscueType(label);\n                    if(label==='Reversion'){\n                      setMiscueDrawerOpen(false);\n                      setReversionSourceWord(Number(selectedPassageWord));\n                      setReversionSelecting(true);\n                      setError(\"\");\n                      return;\n                    }\n                    if(label==='Insertion'){\n                      setMiscueDrawerOpen(false);\n                      setSelectedMiscueType(null);\n                      setMisreadWord(\"\");\n                      void recordPassageMiscue(selectedPassageWord,'Insertion','');\n                      return;\n                    }\n                    if(label!=='Substitution')void recordPassageMiscue(selectedPassageWord,label,'');`;

  if (!source.includes(typeHandlerBefore)) {
    throw new Error(
      "Insertion miscue repair: expected miscue type handler was not found."
    );
  }
  source = source.replace(typeHandlerBefore, typeHandlerAfter);

  const inputBefore = `(selectedMiscueType==='Insertion'||selectedMiscueType==='Substitution') && (`;
  const inputAfter = `(selectedMiscueType==='Substitution') && (`;

  if (!source.includes(inputBefore)) {
    throw new Error(
      "Insertion miscue repair: expected insertion/substitution input condition was not found."
    );
  }
  source = source.replace(inputBefore, inputAfter);

  source = source.replace(
    /\n\s*<label style=\{styles\.miscueEntryLabel\}>What did the learner say\?<\/label>[\s\S]*?<button type=\"button\" style=\{styles\.miscueApplyButton\}[^>]*>Apply Miscue<\/button>/,
    `\n                  <label style={styles.miscueEntryLabel}>What did the learner say?</label>\n                  <input type="text" value={misreadWord} onChange={e=>setMisreadWord(e.target.value)} placeholder="Enter the substituted word" style={styles.miscueDrawerInput} disabled={recordingMiscue} autoFocus />\n                  <button type="button" style={styles.miscueApplyButton} onClick={() => void recordPassageMiscue(selectedPassageWord,selectedMiscueType,misreadWord)} disabled={recordingMiscue||!misreadWord.trim()}>Apply Miscue</button>`
  );

  source = source.replace(
    /\n(\s*)\/\/ CRL_INSERTION_MISCUE_DIRECT_APPLY_V1/,
    "\n$1/* CRL_INSERTION_MISCUE_DIRECT_APPLY_V1 */"
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
