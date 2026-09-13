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

const blockStart = source.indexOf("  const recordWord =");
const blockEnd = source.indexOf("  const recordComprehension =", blockStart);
if (blockStart < 0 || blockEnd <= blockStart) {
  throw new Error("Final Word saving overlay guard: recordWord block was not found.");
}

let block = source.slice(blockStart, blockEnd);
const activation = "setShowWordSavingOverlay(true);";

/* Remove every generated activation, including the previously guarded form
 * and the unguarded copy added by repair-passage-renderer. Reinsert one
 * canonical final-item-only guard below. */
block = block.replace(
  /[ \t]*if \(isFinal\) \{\s*setShowWordSavingOverlay\(true\);\s*\}\s*(?:\/\*\s*CRL_FINAL_WORD_OVERLAY_GUARD\s*\*\/)?/g,
  ""
);
block = block.replace(
  /^[ \t]*setShowWordSavingOverlay\(true\);[ \t]*\r?\n?/gm,
  ""
);
block = block.replace(
  /^[ \t]*\/\*\s*CRL_FINAL_WORD_OVERLAY_GUARD\s*\*\/[ \t]*\r?\n?/gm,
  ""
);

const anchor = "      const isFinal = currentIndex === WORDS.length - 1;";
const anchorCount = block.split(anchor).length - 1;
if (anchorCount !== 1) {
  throw new Error(
    `Final Word saving overlay guard: expected exactly 1 activation anchor, found ${anchorCount}`
  );
}

block = block.replace(
  anchor,
  `${anchor}\n      if (isFinal) {\n        ${activation}\n      }\n      /* ${marker} */`
);

const activationCount = block.split(activation).length - 1;
if (activationCount !== 1) {
  throw new Error(
    `Final Word saving overlay guard: expected exactly 1 activation, found ${activationCount}`
  );
}

source = source.slice(0, blockStart) + block + source.slice(blockEnd);
fs.writeFileSync(target, source, "utf8");

console.log(
  "Applied CRL final Word saving overlay guard: overlay only activates for the last Word Recognition item."
);
