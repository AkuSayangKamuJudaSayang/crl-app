// Teacher-only guidance. Accept equivalent answers supported by the passage.
// Keep this module out of learner and shared assessment runtime imports.
const ANSWERS_BY_QUESTION = new Map(
[
  [
    "What must Para look for?",
    "Fruits or food to eat."
  ],
  [
    "What time or part of the day is it?",
    "Late afternoon or early evening; it is getting dark at the end of the workday."
  ],
  [
    "What does Para land on?",
    "The top of a parked car."
  ],
  [
    "Who does Para see?",
    "A police officer."
  ],
  [
    "What else is the police officer doing besides directing traffic?",
    "Dancing."
  ],
  [
    "What could the police officer be feeling?",
    "Happy, cheerful, or enjoying his work; accept a similar feeling supported by his smile and dancing."
  ],
  [
    "What is the job of Dulnuwan?",
    "He is a farmer."
  ],
  [
    "When do Ali and Dina help Dulnuwan and Bugan?",
    "When they are not in school."
  ],
  [
    "Where do they rest?",
    "Under the shade of a tree."
  ],
  [
    "Why do they rest?",
    "They have worked all morning and need a break or lunch; accept a similar supported answer."
  ],
  [
    "What kind of weather or day is it?",
    "Clear or sunny, with a blue sky and no clouds."
  ],
  [
    "What does Dulnuwan pick up?",
    "A handful of soil."
  ],
  [
    "Where does the small bird land?",
    "Beside the school garden."
  ],
  [
    "Where is Nena when she first sees the bird?",
    "In her classroom, looking through the window."
  ],
  [
    "What does Nena put in the dish?",
    "Clean water."
  ],
  [
    "Where does she place the dish?",
    "Under a leafy tree."
  ],
  [
    "Why does Nena step back and wait quietly?",
    "So the bird will feel safe enough to come closer; accept a similar supported answer."
  ],
  [
    "How might Nena feel when another bird joins the first one?",
    "Happy, pleased, or excited; accept a similar feeling supported by her smile."
  ],
  [
    "Who helps Father in the garden?",
    "Ben and Ana."
  ],
  [
    "What kind of seedlings do they plant?",
    "Tomato seedlings."
  ],
  [
    "Where do they plant the seedlings?",
    "Beside a bamboo fence in the garden."
  ],
  [
    "Why do they pour water around each plant?",
    "The seedlings need water to grow; accept a similar supported answer."
  ],
  [
    "What jumps out from behind a stone?",
    "A brown frog."
  ],
  [
    "How do the children feel when they see the frog?",
    "Amused, happy, or surprised; accept a similar feeling supported by their laughter."
  ],
  [
    "What color is Lito's kite?",
    "Blue."
  ],
  [
    "Who helps Lito fly the kite?",
    "His sister Mila."
  ],
  [
    "Where does the kite get caught?",
    "On a low branch of a mango tree."
  ],
  [
    "Why does Lito stop pulling the string?",
    "He does not want the paper to tear."
  ],
  [
    "What does Mila use to help free the string?",
    "A long stick."
  ],
  [
    "Why do they move farther from the tree before trying again?",
    "To keep the kite from getting caught in the tree again; accept a similar supported answer."
  ],
  [
    "What fruit does Lola pick?",
    "Ripe guavas."
  ],
  [
    "Where is the fruit tree?",
    "Behind Lola's house."
  ],
  [
    "Which guavas do they set aside for lunch?",
    "The soft guavas."
  ],
  [
    "Who goes with Rosa to visit the neighbors?",
    "Her brother."
  ],
  [
    "What do the children do when they reach each house?",
    "They knock and wait politely."
  ],
  [
    "Why might the neighbor smile at the children?",
    "The neighbor is pleased or thankful for the guavas; accept a similar supported answer."
  ]
]
  .map(([question, answer]) => [normalizeQuestion(question), answer])
);

function normalizeQuestion(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function getPossibleStoryAnswer(question) {
  return ANSWERS_BY_QUESTION.get(normalizeQuestion(question)) || "";
}
