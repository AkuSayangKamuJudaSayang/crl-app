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

const marker = "CRL_INSERTION_MISCUE_ROOT_CAUSE_V2";

/*
 * Separate "Substitution input is requested" from selectedMiscueType.
 *
 * selectedMiscueType is allowed to describe an existing annotation.
 * It MUST NOT by itself cause the learner-word input to appear.
 */
const stateAnchor =
  'const [selectedMiscueType, setSelectedMiscueType] = useState(null);';

const stateLine =
  '  const [substitutionInputRequested, setSubstitutionInputRequested] = useState(false);';

if (!source.includes(stateLine)) {
  if (!source.includes(stateAnchor)) {
    throw new Error(
      "Insertion miscue V2: selectedMiscueType state declaration not found."
    );
  }

  source = source.replace(
    stateAnchor,
    `${stateAnchor}\n${stateLine}`,
    1
  );
}

/*
 * Every time a passage word is opened, the Substitution input request
 * starts FALSE. This prevents a previous interaction from leaking into
 * the next word.
 */
source = source.replace(
  /setMisreadWord\(existingMiscue\?\.misreadWord \|\| ""\);\s*setMiscueDrawerOpen\(true\);/g,
  `setMisreadWord(existingMiscue?.misreadWord || "");
            setSubstitutionInputRequested(false);
            setMiscueDrawerOpen(true);`
);

/*
 * Replace the actual miscue-type button handler.
 *
 * Insertion is handled FIRST and never sets selectedMiscueType to
 * "Insertion". It immediately records and closes.
 *
 * Substitution explicitly requests the text-entry UI.
 */
const handlerPattern =
  /onClick=\{\(\) => \{\s*setSelectedMiscueType\(label\);\s*if\s*\(label\s*===\s*["']Reversion["']\)\s*\{[\s\S]*?if\s*\(label\s*===\s*["']Insertion["']\)\s*\{[\s\S]*?return;\s*\}\s*if\s*\(label\s*!==\s*["']Substitution["']\)\s*void\s+recordPassageMiscue\([^;]+;\s*\}\}/;

const handlerReplacement = `onClick={() => {
              if (label === "Insertion") {
                setSubstitutionInputRequested(false);
                setMiscueDrawerOpen(false);
                setSelectedPassageWord(null);
                setSelectedMiscueType(null);
                setMisreadWord("");
                setMiscueWordIndex(1);
                setReversionSelecting(false);
                setReversionSourceWord(null);
                setError("");
                void recordPassageMiscue(selectedPassageWord, "Insertion", "");
                return;
              }

              if (label === "Reversion") {
                setSubstitutionInputRequested(false);
                setMiscueDrawerOpen(false);
                setReversionSourceWord(Number(selectedPassageWord));
                setReversionSelecting(true);
                setError("");
                return;
              }

              if (label === "Substitution") {
                setSelectedMiscueType("Substitution");
                setSubstitutionInputRequested(true);
                return;
              }

              setSubstitutionInputRequested(false);
              setSelectedMiscueType(label);
              void recordPassageMiscue(selectedPassageWord, label, "");
            }}`;

if (handlerPattern.test(source)) {
  source = source.replace(handlerPattern, handlerReplacement);
} else if (
  !source.includes('setSubstitutionInputRequested(true);')
) {
  throw new Error(
    "Insertion miscue V2: actual miscue button handler could not be located."
  );
}

/*
 * The input must ONLY exist when the teacher explicitly clicked
 * Substitution during the current interaction.
 */
const substitutionCondition =
  /\{selectedMiscueType\s*===\s*["']Substitution["']\s*&&\s*\(<div style=\{styles\.miscueEntryArea\}>/;

if (substitutionCondition.test(source)) {
  source = source.replace(
    substitutionCondition,
    "{substitutionInputRequested && (<div style={styles.miscueEntryArea}>",
    1
  );
}

/*
 * Ensure every ordinary close path clears the explicit request.
 */
source = source.replace(
  /onClick=\{\(\) => \{\s*setMiscueDrawerOpen\(false\);\s*setSelectedPassageWord\(null\);\s*setSelectedMiscueType\(null\);\s*setReversionSelecting\(false\);\s*setReversionSourceWord\(null\);\s*setMisreadWord\(""\);\s*\}\}/g,
  `onClick={() => {
                    setSubstitutionInputRequested(false);
                    setMiscueDrawerOpen(false);
                    setSelectedPassageWord(null);
                    setSelectedMiscueType(null);
                    setReversionSelecting(false);
                    setReversionSourceWord(null);
                    setMisreadWord("");
                  }}`
);

/*
 * Verify the REAL resulting source, not merely the repair script itself.
 */
const required = [
  stateLine,
  'if (label === "Insertion") {',
  'setSubstitutionInputRequested(false);',
  'setSubstitutionInputRequested(true);',
  'void recordPassageMiscue(selectedPassageWord, "Insertion", "");',
  "{substitutionInputRequested && (<div style={styles.miscueEntryArea}>",
];

for (const needle of required) {
  if (!source.includes(needle)) {
    throw new Error(
      `Insertion miscue V2 verification failed: ${needle}`
    );
  }
}

/*
 * Critical negative checks:
 * The Substitution input must no longer be controlled directly by
 * selectedMiscueType.
 */
if (
  source.includes(
    '{selectedMiscueType === "Substitution" && (<div style={styles.miscueEntryArea}>'
  )
) {
  throw new Error(
    "Insertion miscue V2 verification failed: old Substitution input condition remains."
  );
}

if (!source.includes(`/* ${marker} */`)) {
  source = source.replace(
    "const removePassageMiscue =",
    `/* ${marker} */\n\nconst removePassageMiscue =`,
    1
  );
}

fs.writeFileSync(file, source, "utf8");

console.log(
  "Applied CRL insertion miscue V2: input is explicit-Substitution-only; Insertion records immediately and closes without learner-word input."
);
