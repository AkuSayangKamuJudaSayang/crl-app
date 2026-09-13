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

const marker = "CRL_INSERTION_MISCUE_ROOT_CAUSE_V1";
const stateAnchor = 'const [selectedMiscueType, setSelectedMiscueType] = useState(null);';
const stateReplacement = `${stateAnchor}\n  const [substitutionInputRequested, setSubstitutionInputRequested] = useState(false);`;

if (!source.includes("const [substitutionInputRequested, setSubstitutionInputRequested] = useState(false);")) {
  if (!source.includes(stateAnchor)) {
    throw new Error("Insertion miscue root-cause repair: selectedMiscueType state anchor not found.");
  }
  source = source.replace(stateAnchor, stateReplacement, 1);
}

const wordClickNormal = `setSelectedMiscueType(existingMiscue?.miscueType || null);\n            setMisreadWord(existingMiscue?.misreadWord || "");\n            setMiscueDrawerOpen(true);`;
const wordClickNormalReplacement = `setSelectedMiscueType(existingMiscue?.miscueType || null);\n            setMisreadWord(existingMiscue?.misreadWord || "");\n            setSubstitutionInputRequested(false);\n            setMiscueDrawerOpen(true);`;
const wordClickReview = `setSelectedMiscueType(existingMiscue?.miscueType || null);\n              setMisreadWord(existingMiscue?.misreadWord || "");\n              setMiscueDrawerOpen(true);`;
const wordClickReviewReplacement = `setSelectedMiscueType(existingMiscue?.miscueType || null);\n              setMisreadWord(existingMiscue?.misreadWord || "");\n              setSubstitutionInputRequested(false);\n              setMiscueDrawerOpen(true);`;

if (source.includes(wordClickNormal)) source = source.replace(wordClickNormal, wordClickNormalReplacement, 1);
if (source.includes(wordClickReview)) source = source.replace(wordClickReview, wordClickReviewReplacement, 1);

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
if (source.includes(oldHandler)) source = source.replace(oldHandler, newHandler, 1);

const oldCondition = `{selectedMiscueType === "Substitution" && (<div style={styles.miscueEntryArea}>`;
const newCondition = `{substitutionInputRequested && (<div style={styles.miscueEntryArea}>`;
if (source.includes(oldCondition)) source = source.replace(oldCondition, newCondition, 1);

const oldClose = `onClick={() => { setMiscueDrawerOpen(false); setSelectedPassageWord(null); setSelectedMiscueType(null); setReversionSelecting(false); setReversionSourceWord(null); setMisreadWord(""); }}`;
const newClose = `onClick={() => { setSubstitutionInputRequested(false); setMiscueDrawerOpen(false); setSelectedPassageWord(null); setSelectedMiscueType(null); setReversionSelecting(false); setReversionSourceWord(null); setMisreadWord(""); }}`;
if (source.includes(oldClose)) source = source.replace(oldClose, newClose, 1);

if (!source.includes(marker)) {
  source = source.replace("const removePassageMiscue =", `/* ${marker} */\n\nconst removePassageMiscue =`, 1);
}

const checks = [
  ["dedicated substitution input state", "const [substitutionInputRequested, setSubstitutionInputRequested] = useState(false);"],
  ["input gated only by explicit substitution request", "{substitutionInputRequested && (<div style={styles.miscueEntryArea}>"] ,
  ["insertion disables substitution input", 'setSubstitutionInputRequested(false);'],
  ["substitution explicitly enables input", 'setSubstitutionInputRequested(true);'],
  ["insertion direct recording", 'void recordPassageMiscue(selectedPassageWord, "Insertion", "");'],
];
for (const [label, needle] of checks) {
  if (!source.includes(needle)) throw new Error(`Insertion miscue root-cause repair verification failed: ${label}.`);
}

fs.writeFileSync(file, source, "utf8");
console.log("Applied CRL insertion miscue root-cause repair: substitution input is explicit-request-only; Insertion records immediately without opening the input.");
