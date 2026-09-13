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
const marker = "CRL_INSERTION_MISCUE_DIRECT_APPLY_V3";

/*
 * Insertion is different from Substitution:
 * - Insertion is attached to the selected passage word immediately.
 * - It must never enter the "What did the learner say?" state.
 * - Substitution still opens the text-entry prompt.
 *
 * The repair runs on every `npm run dev` / `npm run build` so a generated
 * or previously repaired AssessmentClient cannot regress this behavior.
 */

const insertionHandlerPattern = /setSelectedMiscueType\(label\);\s*if\s*\(label\s*===\s*["']Reversion["']\)\s*\{\s*setMiscueDrawerOpen\(false\);\s*setReversionSourceWord\(Number\(selectedPassageWord\)\);\s*setReversionSelecting\(true\);\s*setError\(""\);\s*return;\s*\}\s*if\s*\(label\s*===\s*["']Insertion["']\)\s*\{\s*void\s+recordPassageMiscue\(selectedPassageWord\s*,\s*label\s*,\s*""\);\s*return;\s*\}\s*if\s*\(label\s*!==\s*["']Substitution["']\)\s*void\s+recordPassageMiscue\(selectedPassageWord\s*,\s*label\s*,\s*""\);/s;

const insertionHandlerReplacement = `if(label==='Insertion'){
                      setMiscueDrawerOpen(false);
                      setSelectedPassageWord(null);
                      setSelectedMiscueType(null);
                      setMiscueWordIndex(1);
                      setMisreadWord("");
                      setReversionSelecting(false);
                      setReversionSourceWord(null);
                      setError("");
                      void recordPassageMiscue(selectedPassageWord,'Insertion','');
                      return;
                    }
                    setSelectedMiscueType(label);
                    if(label==='Reversion'){
                      setMiscueDrawerOpen(false);
                      setReversionSourceWord(Number(selectedPassageWord));
                      setReversionSelecting(true);
                      setError("");
                      return;
                    }
                    if(label!=='Substitution')void recordPassageMiscue(selectedPassageWord,label,'');`;

if (insertionHandlerPattern.test(source)) {
  source = source.replace(
    insertionHandlerPattern,
    insertionHandlerReplacement
  );
}

/*
 * Also normalize the alternative compact handler written by some earlier
 * repair versions. This keeps the startup repair idempotent across the
 * existing history of the assessment file.
 */
const compactInsertionPattern = /setSelectedMiscueType\(label\);\s*if\s*\(label==='Reversion'\)\{\s*setMiscueDrawerOpen\(false\);\s*setReversionSourceWord\(Number\(selectedPassageWord\)\);\s*setReversionSelecting\(true\);\s*setError\(""\);\s*return;\s*\}\s*if\s*\(label==='Insertion'\)\{\s*setMiscueDrawerOpen\(false\);\s*setSelectedMiscueType\(null\);\s*setMisreadWord\(""\);\s*void\s+recordPassageMiscue\(selectedPassageWord,'Insertion',''\);\s*return;\s*\}/s;

if (compactInsertionPattern.test(source)) {
  source = source.replace(
    compactInsertionPattern,
    insertionHandlerReplacement
  );
}

/*
 * If a future change ever uses a more conventional JSX handler, apply the
 * same ordering rule there too: handle Insertion before selectedMiscueType
 * is set to the chosen label.
 */
const formattedInsertionPattern = /setSelectedMiscueType\(label\);\s*if\s*\(label\s*===\s*["']Insertion["']\)\s*\{\s*void\s+recordPassageMiscue\(selectedPassageWord\s*,\s*label\s*,\s*""\);\s*return;\s*\}/s;
if (formattedInsertionPattern.test(source)) {
  source = source.replace(
    formattedInsertionPattern,
    insertionHandlerReplacement.split("\n                    setSelectedMiscueType(label);")[0] + "\n" + insertionHandlerReplacement.split("\n                    setSelectedMiscueType(label);")[1].split("\n                    if(label==='Reversion')")[0].trimEnd()
  );
}

/*
 * Keep the entry area strictly Substitution-only. This is a defensive UI
 * guard in addition to the handler ordering above.
 */
source = source.replace(
  /\(selectedMiscueType==='Insertion'\|\|selectedMiscueType==='Substitution'\)\s*&&\s*\(/g,
  `(selectedMiscueType==='Substitution') && (`
);
source = source.replace(
  /\(selectedMiscueType === "Insertion" \|\| selectedMiscueType === "Substitution"\)\s*&&\s*\(/g,
  `(selectedMiscueType === "Substitution") && (`
);

if (!source.includes(marker)) {
  const anchor = "const removePassageMiscue =";
  const index = source.indexOf(anchor);
  if (index < 0) {
    throw new Error("Insertion miscue repair: stable marker anchor not found.");
  }
  source = source.slice(0, index) + `/* ${marker} */\n\n` + source.slice(index);
}

const insertionButtonGuard = /if\s*\(label\s*===\s*["']Insertion["']\)\s*\{[\s\S]{0,1200}?setSelectedMiscueType\(null\)[\s\S]{0,1200}?void\s+recordPassageMiscue\(selectedPassageWord\s*,?\s*["']Insertion["']/;

if (!insertionButtonGuard.test(source)) {
  throw new Error(
    "Insertion miscue repair: final insertion-first handler could not be verified."
  );
}

fs.writeFileSync(file, source, "utf8");

console.log(
  "Applied CRL insertion miscue repair: Insertion records immediately and never opens the learner-word input prompt; Substitution keeps its text prompt."
);
