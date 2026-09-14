const fs = require("node:fs");
const path = require("node:path");

const target = path.join(
  process.cwd(),
  "app",
  "teacher",
  "assessment",
  "AssessmentClient.jsx"
);
const source = fs.readFileSync(target, "utf8");
const routeSource = fs.readFileSync(
  path.join(process.cwd(), "app", "api", "assessment", "route.js"),
  "utf8"
);

function requirePattern(pattern, message) {
  if (!pattern.test(source)) {
    throw new Error(`Assessment invariant failed: ${message}`);
  }
}

function rejectPattern(pattern, message) {
  if (pattern.test(source)) {
    throw new Error(`Assessment invariant failed: ${message}`);
  }
}

function requireCount(text, expected, message) {
  const count = source.split(text).length - 1;
  if (count !== expected) {
    throw new Error(
      `Assessment invariant failed: ${message}; expected ${expected}, found ${count}`
    );
  }
}

function requireRoutePattern(pattern, message) {
  if (!pattern.test(routeSource)) {
    throw new Error(`Assessment route invariant failed: ${message}`);
  }
}

function requireRouteCount(text, expected, message) {
  const count = routeSource.split(text).length - 1;
  if (count !== expected) {
    throw new Error(
      `Assessment route invariant failed: ${message}; expected ${expected}, found ${count}`
    );
  }
}

requirePattern(
  /nextType\s*===\s*["']Substitution["']\s*&&\s*!nextMisreadWord/,
  "only substitution may require a learner-supplied word"
);

requireRouteCount(
  "const existingSessionMetrics =",
  1,
  "session metrics must be loaded before their timer value is read"
);
requireRouteCount(
  "const passageWordCount =",
  1,
  "passage word count must be declared before scoring"
);
requireRoutePattern(
  /const metrics\s*=\s*await tx\.sessionMetrics\.upsert\([\s\S]{0,1600}?return\s*\{[\s\S]{0,300}?metrics,/,
  "calculated metrics must still be persisted and returned"
);
requireRoutePattern(
  /const task1Zero\s*=\s*false\s*;/,
  "the full assessment sequence must not stop after Letter Sounds"
);
requirePattern(
  /if\s*\(\s*label\s*===\s*["']Insertion["']\s*\)\s*\{[\s\S]{0,500}?setSubstitutionInputRequested\s*\(\s*false\s*\)[\s\S]{0,500}?recordPassageMiscue\s*\([\s\S]{0,100}?["']Insertion["']\s*,\s*["']["']\s*\)\s*;?[\s\S]{0,80}?return\s*;/,
  "insertion must clear substitution state, close immediately, apply, and return"
);
requirePattern(
  /\{\s*substitutionInputRequested\s*&&\s*selectedMiscueType\s*===\s*["']Substitution["']\s*&&\s*\(/,
  "the learner-word input must require an explicit substitution request"
);
requirePattern(
  /if\s*\(\s*label\s*===\s*["']Substitution["']\s*\)\s*\{\s*setSubstitutionInputRequested\s*\(\s*true\s*\)\s*;?\s*return\s*;/,
  "only the substitution button may request learner-word input"
);
rejectPattern(
  /selectedMiscueType\s*===\s*["']Insertion["']\s*\|\|\s*selectedMiscueType\s*===\s*["']Substitution["']/,
  "insertion must never share the substitution input condition"
);
rejectPattern(
  /\{\s*selectedMiscueType\s*===\s*["']Substitution["']\s*&&\s*\(/,
  "stale selected type alone must never expose the learner-word input"
);
requirePattern(
  /label\s*===\s*["']Reversion["'][\s\S]{0,220}?passageMiscues\.some\([\s\S]{0,180}?selectedPassageWord/,
  "reversion must be disabled for an already-miscued source word"
);
requirePattern(
  /collidesWithExistingMiscue[\s\S]{0,260}?if\s*\(\s*collidesWithExistingMiscue\s*\)\s*return\s*;/,
  "a reversion pair must reject either already-miscued word"
);

requireCount(
  "const [showWordSavingOverlay, setShowWordSavingOverlay] = useState(false);",
  1,
  "the Word saving overlay state must be declared exactly once"
);
requireCount(
  "setShowWordSavingOverlay(true);",
  1,
  "the Word saving overlay must have exactly one activation"
);
requirePattern(
  /const isFinal\s*=\s*currentIndex\s*===\s*WORDS\.length\s*-\s*1\s*;\s*if\s*\(\s*isFinal\s*\)\s*\{\s*setShowWordSavingOverlay\(true\);\s*\}/,
  "the Word saving overlay must activate only after the final-word check"
);

console.log(
  "Verified assessment invariants: insertion applies immediately, only substitution requests learner input, reversion rejects existing miscues, and the final-word overlay is singular."
);
