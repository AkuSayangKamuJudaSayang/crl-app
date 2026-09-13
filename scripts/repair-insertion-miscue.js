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

const marker = "CRL_INSERTION_MISCUE_ROOT_CAUSE_V3";
const stateLine =
  '  const [substitutionInputRequested, setSubstitutionInputRequested] = useState(false);';
const stateAnchor =
  'const [selectedMiscueType, setSelectedMiscueType] = useState(null);';
const resetLine = "setSubstitutionInputRequested(false);";

if (!source.includes(stateLine)) {
  if (!source.includes(stateAnchor)) {
    throw new Error(
      "Insertion miscue V3: selectedMiscueType state declaration not found."
    );
  }
  source = source.replace(
    stateAnchor,
    `${stateAnchor}\n${stateLine}`,
    1
  );
}

function addResetBeforeStatement(input, statementPattern) {
  const pattern = new RegExp(`(^[ \\t]*)${statementPattern}`, "gm");
  return input.replace(pattern, (match, indent, offset, full) => {
    const previousLineEnd = full.lastIndexOf("\n", offset) - 1;
    const previousLineStart =
      previousLineEnd >= 0
        ? full.lastIndexOf("\n", previousLineEnd) + 1
        : 0;
    const previousLine = full
      .slice(previousLineStart, previousLineEnd + 1)
      .trim();

    if (previousLine === resetLine) return match;
    return `${indent}${resetLine}\n${match}`;
  });
}

// New/opened miscue interactions must never inherit a previous substitution
// input request. This also covers review/timeout entry points.
source = addResetBeforeStatement(
  source,
  "setMiscueDrawerOpen\\(true\\);"
);

// Closing the drawer always terminates the substitution-input interaction.
source = addResetBeforeStatement(
  source,
  "setMiscueDrawerOpen\\(false\\);"
);

// Every existing selected-miscue cleanup also terminates the substitution-input
// interaction. This covers record/remove/finish/stage/timeout cleanup paths.
source = addResetBeforeStatement(
  source,
  "setSelectedMiscueType\\(null\\);"
);

const oldHandler = `onClick={() => { setSelectedMiscueType(label); if (label === "Reversion") { setMiscueDrawerOpen(false); setReversionSourceWord(Number(selectedPassageWord)); setReversionSelecting(true); setError(""); return; } if (label === "Insertion") { void recordPassageMiscue(selectedPassageWord, label, ""); return; } if (label !== "Substitution") void recordPassageMiscue(selectedPassageWord, label, ""); }}`;

const newHandler = `onClick={() => {
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

if (source.includes(oldHandler)) {
  source = source.replace(oldHandler, newHandler, 1);
} else if (!source.includes('setSubstitutionInputRequested(true);')) {
  throw new Error(
    "Insertion miscue V3: actual miscue button handler could not be located."
  );
}

// The learner-word input is valid only when BOTH conditions are true:
// the teacher explicitly requested substitution input for this interaction,
// and the currently selected miscue type is Substitution.
const oldFlagCondition =
  '{substitutionInputRequested && (<div style={styles.miscueEntryArea}>';
const compoundCondition =
  '{substitutionInputRequested && selectedMiscueType === "Substitution" && (<div style={styles.miscueEntryArea}>';
const legacyCondition =
  '{selectedMiscueType === "Substitution" && (<div style={styles.miscueEntryArea}>';

if (source.includes(oldFlagCondition)) {
  source = source.replace(oldFlagCondition, compoundCondition, 1);
} else if (source.includes(legacyCondition)) {
  source = source.replace(legacyCondition, compoundCondition, 1);
}

if (!source.includes(`/* ${marker} */`)) {
  const anchor = "const removePassageMiscue =";
  if (!source.includes(anchor)) {
    throw new Error("Insertion miscue V3: marker anchor not found.");
  }
  source = source.replace(
    anchor,
    `/* ${marker} */\n\n${anchor}`,
    1
  );
}

const compoundConditionRegex =
  /substitutionInputRequested\s*&&\s*selectedMiscueType\s*===\s*["']Substitution["']\s*&&/;

const required = [
  stateLine,
  'if (label === "Insertion") {',
  resetLine,
  'setSubstitutionInputRequested(true);',
  'void recordPassageMiscue(selectedPassageWord, "Insertion", "");',
];

for (const needle of required) {
  if (!source.includes(needle)) {
    throw new Error(
      `Insertion miscue V3 verification failed: ${needle}`
    );
  }
}

if (!compoundConditionRegex.test(source)) {
  throw new Error(
    "Insertion miscue V3 verification failed: compound substitution input condition missing."
  );
}

if (
  source.includes(
    '{selectedMiscueType === "Substitution" && (<div style={styles.miscueEntryArea}>'
  )
) {
  throw new Error(
    "Insertion miscue V3 verification failed: legacy Substitution-only render condition remains."
  );
}

fs.writeFileSync(file, source, "utf8");

console.log(
  "Applied CRL insertion miscue V3: substitution input is current-interaction-only, stale state is cleared on drawer open/close and existing miscue cleanup paths, and only explicit Substitution selection can reveal the learner-word input."
);
