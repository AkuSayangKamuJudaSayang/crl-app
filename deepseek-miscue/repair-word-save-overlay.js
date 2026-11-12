const fs = require("node:fs");
const path = require("node:path");

const target = path.join(
  process.cwd(),
  "app",
  "teacher",
  "assessment",
  "AssessmentClient.jsx"
);

let source = fs.readFileSync(target, "utf8");
const marker = "CRL_FINAL_WORD_OVERLAY_GUARD";

if (!source.includes(marker)) {
  const needle = "setShowWordSavingOverlay(true);";
  const count = source.split(needle).length - 1;

  if (count !== 1) {
    throw new Error(
      `Final Word saving overlay guard: expected exactly 1 marker, found ${count}`
    );
  }

  source = source.replace(
    needle,
    `if (isFinal) {\n        ${needle}\n      }\n      /* ${marker} */`
  );

  fs.writeFileSync(target, source, "utf8");
}

console.log(
  "Applied CRL final Word saving overlay guard: overlay only activates for the last Word Recognition item."
);
