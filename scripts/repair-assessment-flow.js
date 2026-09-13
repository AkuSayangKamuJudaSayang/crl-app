const fs = require("node:fs");
const path = require("node:path");

const routeTarget = path.join(process.cwd(), "app", "api", "assessment", "route.js");
const clientTarget = path.join(process.cwd(), "app", "teacher", "assessment", "AssessmentClient.jsx");

const routeSource = fs.readFileSync(routeTarget, "utf8");
const clientSource = fs.readFileSync(clientTarget, "utf8");

if (!routeSource.includes("const task1Zero = false;")) {
  throw new Error("Assessment flow repair: expected repaired route state was not found.");
}

const substitutionValidation = /nextType\s*===\s*["']Substitution["']\s*&&\s*!nextMisreadWord/;
if (!substitutionValidation.test(clientSource)) {
  throw new Error("Miscue validation repair: expected Substitution-only learner-word validation was not found.");
}

// The passage miscue UI now uses a dedicated state so the learner-word
// input cannot appear merely because the selected miscue type is stale.
// Accept the new explicit state, while remaining compatible with the older
// Substitution-only condition during the repair chain.
const explicitSubstitutionInput = /substitutionInputRequested\s*&&/;
const legacySubstitutionInput = /selectedMiscueType\s*===\s*["']Substitution["']\s*&&/;
if (!explicitSubstitutionInput.test(clientSource) && !legacySubstitutionInput.test(clientSource)) {
  throw new Error("Miscue input repair: expected explicit Substitution-only input state was not found.");
}

const insertionHandler = /if\s*\(\s*label\s*===\s*["']Insertion["']\s*\)\s*\{[\s\S]{0,1600}?recordPassageMiscue\s*\(\s*selectedPassageWord\s*,\s*["']Insertion["']\s*,\s*["']["']\s*\)/;
if (!insertionHandler.test(clientSource)) {
  throw new Error("Insertion miscue repair: expected direct-apply handler was not found.");
}

console.log("CRL assessment flow and miscue repairs verified.");
