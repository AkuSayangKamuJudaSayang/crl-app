const fs = require("node:fs");
const path = require("node:path");

const target = path.join(process.cwd(), "scripts", "repair-assessment-flow.js");
const source = fs.readFileSync(target, "utf8");

const marker = "CRL_BUILD_REPAIR_IDEMPOTENT_V1";
if (source.includes(marker)) {
  console.log("CRL build repair helper already idempotent.");
  process.exit(0);
}

const oldHelper = `function replaceOnce(source, oldValue, newValue, label) {\n  const count = source.split(oldValue).length - 1;\n  if (count !== 1) {\n    throw new Error(\`${"${label}"}: expected exactly 1 match, found ${"${count}"}\`);\n  }\n  return source.replace(oldValue, newValue);\n}`;

const newHelper = `function replaceOnce(source, oldValue, newValue, label) {\n  const count = source.split(oldValue).length - 1;\n\n  if (count === 0) {\n    const alreadyPatchedCount = source.split(newValue).length - 1;\n    if (alreadyPatchedCount === 1) {\n      return source;\n    }\n  }\n\n  if (count !== 1) {\n    throw new Error(\`${"${label}"}: expected exactly 1 match, found ${"${count}"}\`);\n  }\n\n  return source.replace(oldValue, newValue);\n}\n\n/* ${marker} */`;

if (!source.includes(oldHelper)) {
  throw new Error(
    "Build repair patcher: repair-assessment-flow.js replaceOnce helper was not found; refusing to modify an unexpected script."
  );
}

fs.writeFileSync(target, source.replace(oldHelper, newHelper), "utf8");
console.log(
  "Applied CRL build repair patch: repair-assessment-flow replaceOnce is now idempotent when a later repair already applied the desired change."
);
