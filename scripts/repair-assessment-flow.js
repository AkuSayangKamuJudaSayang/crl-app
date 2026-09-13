const fs = require("node:fs");
const path = require("node:path");

const routeTarget = path.join(process.cwd(), "app", "api", "assessment", "route.js");
const clientTarget = path.join(process.cwd(), "app", "teacher", "assessment", "AssessmentClient.jsx");

const routeSource = fs.readFileSync(routeTarget, "utf8");
const clientSource = fs.readFileSync(clientTarget, "utf8");

if (!routeSource.includes("const task1Zero = false;")) {
  throw new Error("Assessment flow repair: expected repaired route state was not found.");
}

if (!clientSource.includes('if (nextType === "Substitution" && !nextMisreadWord) {')) {
  throw new Error("Miscue validation repair: expected repaired client state was not found.");
}

if (!clientSource.includes("selectedMiscueType==='Substitution' && (")) {
  throw new Error("Miscue input repair: expected Substitution-only input state was not found.");
}

if (!clientSource.includes("if(label==='Insertion')")) {
  throw new Error("Insertion miscue repair: expected direct-apply handler was not found.");
}

// CI-safe/idempotent build verifier: never rewrites the working assessment source.
// This intentionally replaces the old replaceOnce-based patcher so repeated Vercel
// builds cannot fail just because a prior repair already changed the source.
console.log("CRL assessment flow and miscue repairs verified.");
