export const ASSESSMENT_PERIODS = ["BoSY", "MoSY", "EoSY"];

export const ASSESSMENT_CONTENT_REQUIREMENTS = Object.freeze({
  letters: 10,
  words: 10,
  stories: 2,
  storyWords: 100,
});

/*
 * How much a teacher may keep. A run only ever administers the minimum above,
 * so extra items exist to let each assessment draw a different set. The
 * ceilings are generous - far beyond a term's letters, words and passages -
 * and exist only so the catalogue the dashboard reloads every few seconds
 * cannot grow without bound.
 */
export const ASSESSMENT_CONTENT_LIMITS = Object.freeze({
  letters: 60,
  words: 60,
  stories: 12,
});

/*
 * How a run picks its items out of however much the teacher has saved.
 *
 * fixed  - the first items in the saved order, identical for every assessment.
 * random - a different combination per assessment, drawn from a seed that is
 *          stable for the whole of that assessment.
 *
 * The choice is stored per teacher and per assessment period, in the content
 * table under a reserved category, so it needs no new table or column.
 */
export const ASSESSMENT_CONTENT_MODES = Object.freeze(["fixed", "random"]);

export const ASSESSMENT_CONTENT_MODE_CATEGORY = "settings";

/*
 * Only part of the table's unique key. The table also checks that a position is
 * positive, so the setting cannot live at position 0.
 */
export const ASSESSMENT_CONTENT_MODE_POSITION = 1;

export const DEFAULT_ASSESSMENT_CONTENT_MODE = "fixed";

export function normalizeAssessmentContentMode(value) {
  const text = String(value || "")
    .trim()
    .toLowerCase();
  return ASSESSMENT_CONTENT_MODES.includes(text)
    ? text
    : DEFAULT_ASSESSMENT_CONTENT_MODE;
}

/*
 * What the story import file picker offers. Kept beside the content rules so
 * the interface can advertise the formats without loading the readers, which
 * carry the archive and PDF code and only load when a file is actually chosen.
 */
export const STORY_IMPORT_FILE_ACCEPT =
  ".txt,.text,.docx,.pdf,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const DEFAULT_ASSESSMENT_LETTERS = [
  "M",
  "S",
  "A",
  "L",
  "O",
  "B",
  "E",
  "U",
  "R",
  "T",
];

export const DEFAULT_ASSESSMENT_WORDS = [
  "clap",
  "jump",
  "eat",
  "drink",
  "stand",
  "dance",
  "fly",
  "pencil",
  "basket",
  "helmet",
];

export const BOSY_DEFAULT_STORIES = [
  {
    id: 1,
    title: "Para the Parrot",
    text: "Para flies away from the houses and into the market. She must look for some fruits and food she can eat. She is having fun, but wants to go home. It is getting dark. There are many cars on the road because it is the end of the work day. Then, she sees something! Para stops flying and lands on top of a parked car. She sees a police officer and he is directing traffic. He is also dancing! Para has never seen a police officer dance. The police officer is smiling. Para wants to learn more about this man.",
  },
  {
    id: 2,
    title: "A Day in the Fields",
    text: "Dulnuwan is a farmer. He works in the fields everyday. His wife Bugan helps him. Ali and Dina help too when they are not in school. Today, Dulnuwan drains the water from the field and prepares the seedbed. Bugan, Ali, and Dina pull the weeds. They work all morning. They rest under the shade of a tree and eat lunch. They eat boiled rice and beans. They are proud of their work. Dulnuwan looks at the clear blue sky. There is not a cloud in sight. He looks at the terraces below. He bends to pick a handful of soil.",
  },
];

export const DEFAULT_ASSESSMENT_CONTENT = Object.freeze({
  BoSY: {
    letters: DEFAULT_ASSESSMENT_LETTERS,
    words: DEFAULT_ASSESSMENT_WORDS,
    stories: BOSY_DEFAULT_STORIES,
  },
  MoSY: {
    letters: DEFAULT_ASSESSMENT_LETTERS,
    words: DEFAULT_ASSESSMENT_WORDS,
    stories: [],
  },
  EoSY: {
    letters: DEFAULT_ASSESSMENT_LETTERS,
    words: DEFAULT_ASSESSMENT_WORDS,
    stories: [],
  },
});

export function cloneAssessmentContent(source = DEFAULT_ASSESSMENT_CONTENT) {
  const result = {};

  for (const period of ASSESSMENT_PERIODS) {
    const periodContent = source?.[period] || {};
    result[period] = {
      letters: Array.isArray(periodContent.letters)
        ? periodContent.letters.map((item) => String(item || ""))
        : [],
      words: Array.isArray(periodContent.words)
        ? periodContent.words.map((item) => String(item || ""))
        : [],
      stories: Array.isArray(periodContent.stories)
        ? periodContent.stories.map((story, index) => ({
            id: story?.id ?? `${period.toLowerCase()}-story-${index + 1}`,
            title: String(story?.title || ""),
            text: String(story?.text ?? story?.content ?? ""),
          }))
        : [],
    };
  }

  return result;
}

/*
 * Deterministic shuffle. The seed must be stable for one assessment and differ
 * between assessments - the assessment code is exactly that - because the
 * administered items are matched to the marking journal by index. A reshuffle
 * between two requests in the same run would silently pair a marked answer with
 * a different letter.
 */
function hashSeed(value) {
  const text = String(value || "");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function seededShuffle(items, seed) {
  const list = Array.isArray(items) ? items.slice() : [];
  if (!seed || list.length < 2) return list;

  let state = hashSeed(seed) || 1;
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  for (let index = list.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(next() * (index + 1));
    [list[index], list[swap]] = [list[swap], list[index]];
  }

  return list;
}

/*
 * A run always administers a fixed number of items, whatever the teacher has
 * stored. Teachers may keep more than the minimum - the editor holds them all -
 * and this trims the set a session actually uses, so adding extra content can
 * never change how many letters, words or stories a learner is given.
 *
 * Without a seed the first items in order are used, which is the fixed set that
 * is the same for every assessment. With a seed the set is shuffled first, so
 * each assessment draws a different combination while staying stable for the
 * whole of that assessment.
 *
 * Story objects carry extra fields, so this slices rather than normalising.
 */
export function limitAssessmentContentForRun(value, seed) {
  const source = value || {};
  const take = (items, required, category) => {
    if (!Array.isArray(items)) return [];
    const ordered = seed ? seededShuffle(items, `${seed}:${category}`) : items;
    return ordered.slice(0, required);
  };

  return {
    letters: take(source.letters, ASSESSMENT_CONTENT_REQUIREMENTS.letters, "letters"),
    words: take(source.words, ASSESSMENT_CONTENT_REQUIREMENTS.words, "words"),
    stories: take(source.stories, ASSESSMENT_CONTENT_REQUIREMENTS.stories, "stories"),
  };
}

/*
 * The single place that turns "what the teacher saved" plus "how this teacher
 * wants it picked" into "what this assessment administers".
 *
 * The server and the offline runtime both call this, so an assessment started
 * with a connection and the same assessment resumed without one administer the
 * same items. A random draw without a seed deliberately falls back to the saved
 * order: an assessment must never pick its items from anything unstable, so a
 * caller that forgets the run seed gets the fixed set rather than a surprise.
 */
export function selectAssessmentContentForRun(value, mode, seed) {
  const resolvedSeed =
    normalizeAssessmentContentMode(mode) === "random" ? seed : undefined;
  return limitAssessmentContentForRun(value, resolvedSeed || undefined);
}

export function splitStoryWords(value) {
  const trimmed = String(value || "").trim();
  return trimmed ? trimmed.split(/\s+/) : [];
}

export function storyWordCount(value) {
  return splitStoryWords(value).length;
}

export function normalizeAssessmentPeriodContent(value) {
  const source = value || {};
  return {
    letters: Array.isArray(source.letters)
      ? source.letters.map((item) => String(item || "").trim()).filter(Boolean)
      : [],
    words: Array.isArray(source.words)
      ? source.words.map((item) => String(item || "").trim()).filter(Boolean)
      : [],
    stories: Array.isArray(source.stories)
      ? source.stories.map((story, index) => ({
          id: story?.id ?? `story-${index + 1}`,
          title: String(story?.title || "").trim(),
          text: splitStoryWords(story?.text ?? story?.content).join(" "),
        }))
      : [],
  };
}

export function getAssessmentContentIssues(value) {
  const content = normalizeAssessmentPeriodContent(value);
  const issues = [];
  const labels = {
    letters: "Letters",
    words: "Words",
    stories: "Stories",
  };

  for (const category of ["letters", "words", "stories"]) {
    const required = ASSESSMENT_CONTENT_REQUIREMENTS[category];
    const limit = ASSESSMENT_CONTENT_LIMITS[category];
    const count = content[category].length;
    /*
     * Extra items are allowed - and wanted, because a run draws from them - so
     * only a shortfall or a pool past the ceiling blocks saving.
     */
    if (count > limit) {
      issues.push({
        category,
        count,
        required,
        limit,
        message: `${labels[category]}: ${limit} is the most that can be saved (${count} saved). Remove ${
          count - limit
        } to continue.`,
      });
      continue;
    }

    if (count >= required) continue;

    const missing = required - count;
    issues.push({
      category,
      count,
      required,
      message: `${labels[category]}: add ${missing} more ${
        category === "stories" ? "story" : "item"
      }${missing === 1 ? "" : "s"} to reach the minimum of ${required}.`,
    });
  }

  content.letters.forEach((letter, index) => {
    if (!/^[A-Za-z]$/.test(letter)) {
      issues.push({
        category: "letters",
        index,
        message: `Letter ${index + 1} must contain exactly one letter.`,
      });
    }
  });

  content.words.forEach((word, index) => {
    if (!/^[A-Za-z]{1,9}$/.test(word)) {
      issues.push({
        category: "words",
        index,
        message: `Word ${index + 1} must use letters only and contain no more than 9 characters.`,
      });
    }
  });

  content.stories.forEach((story, index) => {
    if (!story.title) {
      issues.push({
        category: "stories",
        index,
        message: `Story ${index + 1} needs a title.`,
      });
    }

    const count = storyWordCount(story.text);
    if (count !== ASSESSMENT_CONTENT_REQUIREMENTS.storyWords) {
      issues.push({
        category: "stories",
        index,
        message: `Story ${index + 1} must contain exactly 100 words (${count}/100).`,
      });
    }
  });

  return issues;
}

export function isAssessmentPeriodContentComplete(value) {
  return getAssessmentContentIssues(value).length === 0;
}
