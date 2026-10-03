/*
 * Guards the assessment-content selection rules.
 *
 * Teachers may now save more than the run needs (more than 10 letters, 10
 * words, 2 stories). Every assessment therefore has to narrow that pool down
 * to exactly what gets administered. This script proves the narrowing is
 * safe in both modes:
 *
 *   - no seed  -> the fixed set, in the saved order (the original behaviour)
 *   - a seed   -> a deterministic draw, so one assessment always administers
 *                 the same items while different assessments differ
 *
 * A regression here administers the wrong number of items, which desyncs the
 * teacher's submitted-item bookkeeping from the learner's task list, so it is
 * checked on every build rather than by hand.
 */
import {
  ASSESSMENT_CONTENT_LIMITS,
  ASSESSMENT_CONTENT_REQUIREMENTS,
  getAssessmentContentIssues,
  limitAssessmentContentForRun,
  normalizeAssessmentPeriodContent,
  seededShuffle,
  selectAssessmentContentForRun,
} from "../lib/assessmentContent.js";

let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
};

const { letters: LETTER_COUNT, words: WORD_COUNT, stories: STORY_COUNT } = ASSESSMENT_CONTENT_REQUIREMENTS;

const letters = "ABCDEFGHIJKLMNO".split("");
const words = Array.from({ length: 15 }, (_, i) => `item${String.fromCharCode(97 + i)}item`);
const stories = [1, 2, 3, 4].map((n) => ({ id: `s${n}`, title: `Story ${n}`, text: `passage ${n}` }));
const content = { letters, words, stories };

console.log("=== no seed keeps the fixed set, in the saved order ===");
const fixed = limitAssessmentContentForRun(content);
check(
  `letters are the first ${LETTER_COUNT} in order`,
  fixed.letters.join("") === letters.slice(0, LETTER_COUNT).join(""),
  fixed.letters.join("")
);
check("words are the first ten in order", fixed.words.join(",") === words.slice(0, WORD_COUNT).join(","));
check("stories are the first two", fixed.stories.map((s) => s.title).join(",") === "Story 1,Story 2");
check(
  `counts are exactly ${LETTER_COUNT}/${WORD_COUNT}/${STORY_COUNT}`,
  fixed.letters.length === LETTER_COUNT && fixed.words.length === WORD_COUNT && fixed.stories.length === STORY_COUNT
);
check("story objects survive intact", fixed.stories[0].text === "passage 1");

console.log("\n=== a seed is deterministic ===");
const a1 = limitAssessmentContentForRun(content, "ASSESS1");
const a2 = limitAssessmentContentForRun(content, "ASSESS1");
check("same seed gives the same letters", a1.letters.join("") === a2.letters.join(""), a1.letters.join(""));
check("same seed gives the same words", a1.words.join(",") === a2.words.join(","));
check(
  "same seed gives the same stories",
  a1.stories.map((s) => s.id).join(",") === a2.stories.map((s) => s.id).join(",")
);

console.log("\n=== different assessments draw differently ===");
const picks = new Set();
const storyPicks = new Set();
for (const code of ["AAAAAA", "BBBBBB", "CCCCCC", "DDDDDD", "EEEEEE", "FFFFFF"]) {
  const run = limitAssessmentContentForRun(content, code);
  picks.add(run.letters.join(""));
  storyPicks.add(run.stories.map((s) => s.id).join(","));
}
check("six assessment codes produce more than one letter order", picks.size > 1, `${picks.size} distinct`);
check("six assessment codes produce more than one story pair", storyPicks.size > 1, `${storyPicks.size} distinct`);

console.log("\n=== every draw respects the counts and stays inside the pool ===");
let allGood = true;
for (const code of ["AAAAAA", "BBBBBB", "CCCCCC", "ZZZZZZ", "123456"]) {
  const run = limitAssessmentContentForRun(content, code);
  if (run.letters.length !== LETTER_COUNT || run.words.length !== WORD_COUNT || run.stories.length !== STORY_COUNT) {
    allGood = false;
  }
  if (new Set(run.letters).size !== LETTER_COUNT) allGood = false;
  if (run.letters.some((letter) => !letters.includes(letter))) allGood = false;
  if (run.words.some((word) => !words.includes(word))) allGood = false;
  if (run.stories.some((story) => !stories.some((saved) => saved.id === story.id))) allGood = false;
}
check(`every code yields ${LETTER_COUNT} unique letters, ${WORD_COUNT} words, ${STORY_COUNT} real stories`, allGood);

console.log("\n=== a pool of exactly the minimum is never disturbed ===");
const exact = {
  letters: letters.slice(0, LETTER_COUNT),
  words: words.slice(0, WORD_COUNT),
  stories: stories.slice(0, STORY_COUNT)
};
const exactSeeded = limitAssessmentContentForRun(exact, "ASSESS1");
check(
  `still ${LETTER_COUNT}/${WORD_COUNT}/${STORY_COUNT}`,
  exactSeeded.letters.length === LETTER_COUNT &&
    exactSeeded.words.length === WORD_COUNT &&
    exactSeeded.stories.length === STORY_COUNT
);
check("every saved letter is still administered", exactSeeded.letters.slice().sort().join("") === exact.letters.slice().sort().join(""));

console.log("\n=== a short pool is passed through, never padded ===");
const short = { letters: ["A", "B"], words: [], stories: [stories[0]] };
const shortRun = limitAssessmentContentForRun(short, "ASSESS1");
check("short letters stay short", shortRun.letters.length === 2, shortRun.letters.join(""));
check("empty words stay empty", shortRun.words.length === 0);
check("single story stays single", shortRun.stories.length === 1);

console.log("\n=== shuffle helper edge cases ===");
check("empty list safe", seededShuffle([], "x").length === 0);
check("single item safe", seededShuffle(["A"], "x").join("") === "A");
check("non-array safe", seededShuffle(null, "x").length === 0);
check("no seed returns items in order", seededShuffle(["A", "B", "C"]).join("") === "ABC");
check("shuffle preserves membership", seededShuffle(["A", "B", "C", "D"], "k").slice().sort().join("") === "ABCD");
const untouched = ["A", "B", "C", "D"];
seededShuffle(untouched, "k");
check("shuffle never mutates the input", untouched.join("") === "ABCD", untouched.join(""));

const untouchedContent = { letters: letters.slice(), words: words.slice(), stories: stories.slice() };
limitAssessmentContentForRun(untouchedContent, "ASSESS1");
check(
  "selecting never mutates the saved pool",
  untouchedContent.letters.length === letters.length &&
    untouchedContent.words.length === words.length &&
    untouchedContent.stories.length === stories.length
);

console.log("\n=== the mode decides, and a missing seed is never unstable ===");
check(
  "fixed mode ignores the seed",
  selectAssessmentContentForRun(content, "fixed", "ASSESS1").letters.join("") ===
    selectAssessmentContentForRun(content, "fixed", "OTHER9").letters.join("")
);
check(
  "fixed mode is the saved order",
  selectAssessmentContentForRun(content, "fixed", "ASSESS1").letters.join("") ===
    letters.slice(0, LETTER_COUNT).join("")
);
check(
  "random mode with a seed draws a different combination",
  selectAssessmentContentForRun(content, "random", "ASSESS1").letters.join("") !==
    letters.slice(0, LETTER_COUNT).join("")
);
check(
  "random mode without a seed falls back to the saved order",
  selectAssessmentContentForRun(content, "random").letters.join("") ===
    letters.slice(0, LETTER_COUNT).join("")
);
check(
  "an unknown mode falls back to fixed",
  selectAssessmentContentForRun(content, "shuffle", "ASSESS1").letters.join("") ===
    letters.slice(0, LETTER_COUNT).join("")
);
check(
  "random mode is stable for the whole assessment",
  ["A", "B", "C", "D", "E", "F", "G", "H"].every((code) => {
    const first = selectAssessmentContentForRun(content, "random", code);
    const second = selectAssessmentContentForRun(content, "random", code);
    return (
      first.letters.join("") === second.letters.join("") &&
      first.words.join(",") === second.words.join(",") &&
      first.stories.map((s) => s.id).join(",") === second.stories.map((s) => s.id).join(",")
    );
  })
);

/*
 * The teacher's device and the learner's device must administer the very same
 * items. Online both read the server catalogue; offline the runtime rebuilds it
 * from the cached snapshot through normalizeAssessmentPeriodContent. If those
 * two shapes ever drew differently, a learner would be read one letter while
 * the teacher marked another.
 */
console.log("\n=== the server read and the offline read agree ===");
const serverPool = {
  letters: letters.slice(),
  words: words.slice(),
  stories: stories.map((story) => ({
    id: story.id,
    title: story.title,
    description: "Story passage from Manage Assessment.",
    text: `${story.text} ${story.text}`,
    available: true,
  })),
};
const cachedSnapshot = { activities: { BoSY: { letters: letters.slice(), words: words.slice(), stories: stories.map((s) => ({ id: s.id, title: s.title, text: s.text })) } } };
const offlinePool = normalizeAssessmentPeriodContent(cachedSnapshot.activities.BoSY);

for (const mode of ["fixed", "random"]) {
  const agreed = ["AAAAAA", "BBBBBB", "CDEFGH", "ZZZZZZ"].every((code) => {
    const online = selectAssessmentContentForRun(serverPool, mode, code);
    const offline = selectAssessmentContentForRun(offlinePool, mode, code);
    return (
      online.letters.join("") === offline.letters.join("") &&
      online.words.join(",") === offline.words.join(",") &&
      online.stories.map((story) => story.id).join(",") ===
        offline.stories.map((story) => story.id).join(",")
    );
  });
  check(`the online and offline reads agree in ${mode} mode`, agreed);
}

console.log("\n=== the pool ceiling allows extra content but stays bounded ===");
const hundredWordText = Array.from({ length: ASSESSMENT_CONTENT_REQUIREMENTS.storyWords }, (_, i) => `word${i}`).join(" ");
const validStory = (n) => ({ id: `v${n}`, title: `Passage ${n}`, text: hundredWordText });
const generous = {
  letters: Array.from({ length: ASSESSMENT_CONTENT_LIMITS.letters }, (_, i) => String.fromCharCode(65 + (i % 26))),
  words: Array.from({ length: ASSESSMENT_CONTENT_LIMITS.words }, (_, i) => `word${String.fromCharCode(97 + (i % 26))}`),
  stories: Array.from({ length: ASSESSMENT_CONTENT_LIMITS.stories }, (_, i) => validStory(i + 1)),
};
check(
  "a pool at the ceiling has no issues",
  getAssessmentContentIssues(generous).length === 0
);
check(
  "extra content beyond one assessment is accepted",
  getAssessmentContentIssues({ ...generous, letters: letters.slice(0, 15), words: words.slice(0, 15), stories: [validStory(1), validStory(2), validStory(3), validStory(4)] }).length === 0
);
check(
  "a pool past the ceiling is reported",
  getAssessmentContentIssues({
    ...generous,
    letters: [...generous.letters, "Z"],
  }).some((issue) => issue.category === "letters")
);
check(
  "a shortfall is still reported",
  getAssessmentContentIssues({ letters: [], words: [], stories: [] }).length === 3
);

console.log(failures ? `\n${failures} CONTENT-SELECTION CHECK(S) FAILED` : "\nVerified content selection: fixed order by default, deterministic draws when seeded, always the exact administered counts.");
process.exit(failures ? 1 : 0);
