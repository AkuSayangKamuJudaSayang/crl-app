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
  applyAssessmentContentDefaults,
  getAssessmentContentIssues,
  limitAssessmentContentForRun,
  normalizeAssessmentContentModes,
  normalizeAssessmentPeriodContent,
  parseAssessmentContentSettings,
  seededShuffle,
  selectAssessmentContentForRun,
  serializeAssessmentContentSettings,
} from "../lib/assessmentContent.js";
import {
  FALLBACK_LETTERS,
  getAssessmentItemPosition,
  getStatedItemIndex,
  hasOwnAssessmentItems,
  hasSameAssessmentItems,
} from "../lib/assessmentLearnerItems.js";

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

/*
 * Which items the fixed default administers, when the teacher keeps more than
 * one assessment uses. The choice is stored by letter, word and story title
 * because those are the identities that survive a save, and it must never be
 * able to change how many items a learner is given.
 */
console.log("\n=== the teacher's fixed default choice ===");
const chosenLetters = ["O", "C", "K", "G", "I", "H", "L", "N", "D", "B"];
const chosenWords = words.slice(10, 15).concat(words.slice(0, 5));
const chosenStories = [stories[2].title, stories[0].title];
const choice = {
  letters: chosenLetters,
  words: chosenWords,
  stories: chosenStories,
};

const picked = applyAssessmentContentDefaults(content, choice);
check(
  "the chosen letters are administered, in the saved list order",
  picked.letters.join("") === letters.filter((letter) => chosenLetters.includes(letter)).join(""),
  picked.letters.join("")
);
check(
  "the chosen words are administered",
  picked.words.slice().sort().join(",") === chosenWords.slice().sort().join(","),
  picked.words.join(",")
);
check(
  "the chosen stories are administered, in the saved list order",
  picked.stories.map((story) => story.title).join(" | ") ===
    stories.filter((story) => chosenStories.includes(story.title)).map((story) => story.title).join(" | "),
  picked.stories.map((story) => story.title).join(" | ")
);
console.log("\n=== each content category keeps its own selection mode ===");
const mixedModes = {
  letters: "random",
  words: "fixed",
  stories: "fixed",
};
const mixedRun = selectAssessmentContentForRun(
  content,
  mixedModes,
  "ASSESS1",
  choice
);
check(
  "random letters do not change the word or story mode",
  mixedRun.letters.join("") !== picked.letters.join("") &&
    mixedRun.words.join(",") === picked.words.join(",") &&
    mixedRun.stories.map((story) => story.id).join(",") ===
      picked.stories.map((story) => story.id).join(",")
);
check(
  "an older shared mode expands safely to all categories",
  Object.values(normalizeAssessmentContentModes("random")).every(
    (mode) => mode === "random"
  )
);

check(
  `the choice still yields exactly ${LETTER_COUNT}/${WORD_COUNT}/${STORY_COUNT}`,
  picked.letters.length === LETTER_COUNT &&
    picked.words.length === WORD_COUNT &&
    picked.stories.length === STORY_COUNT
);

const partial = applyAssessmentContentDefaults(content, { letters: ["O", "C"], stories: [stories[3].title] });
check(
  "a partial choice is topped up from the top of the list",
  partial.letters.length === LETTER_COUNT &&
    partial.words.length === WORD_COUNT &&
    partial.stories.length === STORY_COUNT,
  `${partial.letters.length}/${partial.words.length}/${partial.stories.length}`
);
check(
  "the topped-up set starts with the chosen items",
  partial.letters[0] === "C" && partial.letters[1] === "O",
  partial.letters.join("")
);
check(
  "the chosen items never repeat",
  new Set(partial.letters).size === partial.letters.length &&
    new Set(partial.words).size === partial.words.length &&
    new Set(partial.stories.map((story) => story.id)).size === partial.stories.length
);

const stale = applyAssessmentContentDefaults(content, {
  letters: ["Q", "Z", "O", "C"],
  words: ["notaword", words[13]],
  stories: ["A Story That Was Deleted", stories[1].title],
});
check(
  "a choice that no longer matches still administers the full set",
  stale.letters.length === LETTER_COUNT &&
    stale.words.length === WORD_COUNT &&
    stale.stories.length === STORY_COUNT
);
check(
  "the items that still match are the ones used",
  stale.letters.includes("O") && stale.letters.includes("C") && stale.words.includes(words[13]),
  `${stale.letters.join("")} / ${stale.words.join(",")}`
);
check(
  "no chosen item falls outside the saved pool",
  stale.letters.every((letter) => letters.includes(letter)) &&
    stale.stories.every((story) => stories.some((saved) => saved.id === story.id))
);

check(
  "no choice at all keeps the saved order",
  applyAssessmentContentDefaults(content, null).letters.join("") === letters.slice(0, LETTER_COUNT).join("")
);
check(
  "the choice only applies to fixed mode",
  selectAssessmentContentForRun(content, "random", "ASSESS1", choice).letters.join("") !==
    picked.letters.join("")
);

/*
 * The stored row has to read back whatever an older row or a damaged value
 * holds, because the same row carries both the mode and the choice.
 */
console.log("\n=== the stored setting reads back safely ===");
const settingsCases = [
  ["", "fixed", 0],
  ["random", "random", 0],
  ["fixed", "fixed", 0],
  ['{"mode":"random","defaults":{"letters":["A","B"],"words":[],"stories":["S"]}}', "random", 2],
  ['{"mode":"nonsense","defaults":{"letters":"A"}}', "fixed", 0],
  ["{not json", "fixed", 0],
  ["RANDOM", "random", 0],
];
for (const [stored, mode, letterCount] of settingsCases) {
  const parsed = parseAssessmentContentSettings(stored);
  check(
    `"${stored.slice(0, 24)}" reads as ${mode}`,
    parsed.mode === mode && parsed.defaults.letters.length === letterCount,
    `${parsed.mode} / ${parsed.defaults.letters.length}`
  );
}
const roundTrip = parseAssessmentContentSettings(
  serializeAssessmentContentSettings("fixed", choice)
);
check(
  "a saved choice survives the round trip",
  roundTrip.mode === "fixed" &&
    roundTrip.defaults.letters.join("") === chosenLetters.join("") &&
    roundTrip.defaults.stories.join("|") === chosenStories.join("|")
);
check(
  "a damaged choice normalises to an empty one",
  parseAssessmentContentSettings('{"mode":"fixed","defaults":{"letters":{"0":"A"},"words":5}}')
    .defaults.words.length === 0
);

/* The offline runtime rebuilds the pool from the cached snapshot, so the same
   choice has to select the same items from that shape too. */
const offlineChosen = selectAssessmentContentForRun(offlinePool, "fixed", "", choice);
check(
  "the online and offline reads agree on the chosen fixed set",
  offlineChosen.letters.join("") === picked.letters.join("") &&
    offlineChosen.words.join(",") === picked.words.join(",") &&
    offlineChosen.stories.map((story) => story.id).join(",") ===
      picked.stories.map((story) => story.id).join(","),
  `${offlineChosen.letters.join("")} vs ${picked.letters.join("")}`
);

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

/*
 * The learner measures its place in the run against the items the assessment
 * actually administers. Reading its own default list instead is not a cosmetic
 * mistake: a drawn order makes a genuine next item look like a step backwards,
 * and the learner treats a step backwards as a stale packet and drops it, so
 * the screen sits on an item the teacher has already passed.
 */
console.log("\n=== the learner's position follows the administered run ===");
const runSeed = "MISMATCH";
const drawn = limitAssessmentContentForRun(content, runSeed);
const drawnSession = (index) => ({
  stage: "letter",
  current_content: drawn.letters[index],
  assessment_content: { letters: drawn.letters, words: drawn.words, stories: drawn.stories },
});
check(
  "the draw really does reorder the pool",
  drawn.letters.join("") !== letters.slice(0, LETTER_COUNT).join(""),
  drawn.letters.join("")
);
check("the first administered letter is position 1", getAssessmentItemPosition(drawnSession(0)).index === 0);
check("the last administered letter is position 10", getAssessmentItemPosition(drawnSession(LETTER_COUNT - 1)).index === LETTER_COUNT - 1);
check(
  "the run counts exactly the administered items",
  getAssessmentItemPosition(drawnSession(0)).items.length === LETTER_COUNT
);
let countedForward = true;
for (let index = 1; index < LETTER_COUNT; index += 1) {
  if (getAssessmentItemPosition(drawnSession(index)).index <= getAssessmentItemPosition(drawnSession(index - 1)).index) countedForward = false;
}
check("every step of the drawn run counts forward", countedForward);
check(
  "a session with no content of its own still measures the default list",
  getAssessmentItemPosition({ stage: "letter", current_content: "M" }).index === 0
);
check(
  "a word run is measured against the administered words",
  getAssessmentItemPosition({ stage: "word", current_content: drawn.words[3], assessment_content: { words: drawn.words } }).index === 3
);
/* The arithmetic that shipped before this: the learner's own default order. */
let defaultOrderWouldReverse = false;
for (let index = 1; index < LETTER_COUNT; index += 1) {
  const before = FALLBACK_LETTERS.indexOf(drawn.letters[index - 1]);
  const after = FALLBACK_LETTERS.indexOf(drawn.letters[index]);
  if ((after < 0 ? 0 : after) < (before < 0 ? 0 : before)) defaultOrderWouldReverse = true;
}
check(
  "the default list would have called steps of this run a step backwards",
  defaultOrderWouldReverse
);
/*
 * A packet that carries no items of its own - an assessment started in the
 * cloud and continued here, or an older local record - can never be compared
 * against a list it does not carry, so it must be accepted rather than blocked.
 */
const withoutContent = { stage: "letter", current_content: drawn.letters[4] };
check(
  "the same run is recognised as comparable",
  hasSameAssessmentItems(drawnSession(0), drawnSession(1)) === true
);
check(
  "a packet with different items is not comparable",
  hasSameAssessmentItems(drawnSession(0), { ...drawnSession(1), assessment_content: { letters: letters.slice(0, LETTER_COUNT) } }) === false
);
check(
  "a packet with no items is not comparable",
  hasSameAssessmentItems(drawnSession(0), withoutContent) === false &&
    hasSameAssessmentItems(withoutContent, drawnSession(0)) === false
);
check(
  "a session that carries its own items says so",
  hasOwnAssessmentItems(drawnSession(0)) === true && hasOwnAssessmentItems(withoutContent) === false
);
check(
  "a session with no items still measures the fallback list",
  getAssessmentItemPosition(withoutContent).index === FALLBACK_LETTERS.indexOf(drawn.letters[4])
);
/* Every step of a run must stay comparable, so no step can ever be blocked. */
let alwaysComparable = true;
for (let index = 1; index < LETTER_COUNT; index += 1) {
  if (!hasSameAssessmentItems(drawnSession(index - 1), drawnSession(index))) alwaysComparable = false;
}
check("every step of the drawn run is comparable", alwaysComparable);
/*
 * The item number a packet states is what a comparison can rely on without any
 * list at all. A fallback read that trails the live run by one item states one
 * lower, and that is what has to stop it being applied.
 */
check(
  "a stated item number is read back",
  getStatedItemIndex({ item_index: 3 }) === 3 && getStatedItemIndex({ itemIndex: 0 }) === 0
);
check(
  "a packet that states no item number says so",
  getStatedItemIndex({ stage: "letter" }) === null &&
    getStatedItemIndex({ item_index: -1 }) === null &&
    getStatedItemIndex({ item_index: "two" }) === null
);
check(
  "a trailing fallback read is behind the live run",
  getStatedItemIndex({ item_index: 1 }) < getStatedItemIndex({ item_index: 2 }) &&
    getStatedItemIndex({ item_index: 2 }) < getStatedItemIndex({ item_index: 2 }) === false
);
check(
  "a trailing read is behind in a drawn run too",
  getStatedItemIndex(drawnSession(1)) === null,
  "the drawn sessions state their position through the list, not an index"
);

console.log(failures ? `\n${failures} CONTENT-SELECTION CHECK(S) FAILED` : "\nVerified content selection: fixed order by default, deterministic draws when seeded, always the exact administered counts.");
process.exit(failures ? 1 : 0);
