// Original Grade 3 passages for the school-authorized custom assessment pool.
// Titles are the stable link between Add Story and its comprehension prompts.
// These are custom assessment passages, not DepEd-issued tools.
export const CUSTOM_ASSESSMENT_STORIES = [
  {
    period: "MoSY",
    title: "A Bird at the School Garden",
    text: "A small bird lands beside the school garden. It hops near a row of pots and looks around. Nena sees the bird from her classroom window. The sun is warm, and the soil looks dry. She fills a shallow dish with clean water. Then she places it under a leafy tree. Nena steps back and waits quietly. The bird tilts its head before hopping toward the dish. It drinks a little water and shakes its wings. Soon, another bird joins it in the shade. Nena smiles at the two visitors. She wonders if they will return to the garden tomorrow.",
    questions: [
      "Where does the small bird land?",
      "Where is Nena when she first sees the bird?",
      "What does Nena put in the dish?",
      "Where does she place the dish?",
      "Why does Nena step back and wait quietly?",
      "How might Nena feel when another bird joins the first one?",
    ],
  },
  {
    period: "MoSY",
    title: "Water for the Seedlings",
    text: "Ben and Ana help their father in the garden. They plant small tomato seedlings beside a bamboo fence. Father makes holes while the children carry the plants. Ana holds each stem gently. Ben covers the roots with soft soil. When the sun rises higher, they stop to drink water. The seedlings need a drink too. Ben brings a pail, and Ana fills a small can. They pour water slowly around each plant. A brown frog jumps out from behind a stone. The children laugh as it hides under a leaf. Father smiles and points to the next row of seedlings.",
    questions: [
      "Who helps Father in the garden?",
      "What kind of seedlings do they plant?",
      "Where do they plant the seedlings?",
      "Why do they pour water around each plant?",
      "What jumps out from behind a stone?",
      "How do the children feel when they see the frog?",
    ],
  },
  {
    period: "EoSY",
    title: "The Kite in the Mango Tree",
    text: "Lito takes his blue kite to the open field. His sister Mila holds it while he checks the string. A gentle wind lifts the kite above their heads. They watch it dip and dance against the bright sky. Suddenly, the wind changes. The kite catches on a low branch of a mango tree. Lito stops pulling because the paper might tear. Mila finds a long stick on the ground. Together, they gently lift the string off the branch. The kite drops onto the grass without a tear. Lito thanks his sister. They move farther from the tree before trying again.",
    questions: [
      "What color is Lito's kite?",
      "Who helps Lito fly the kite?",
      "Where does the kite get caught?",
      "Why does Lito stop pulling the string?",
      "What does Mila use to help free the string?",
      "Why do they move farther from the tree before trying again?",
    ],
  },
  {
    period: "EoSY",
    title: "A Basket for the Neighbors",
    text: "Lola picks ripe guavas from the tree behind her house. Rosa helps her place the fruit in a basket. Some guavas are round, while others look like tiny pears. They wash the fruit and set aside the soft ones for lunch. There are many guavas left. Lola asks Rosa to bring a few to their neighbors. Rosa puts them in small bags and walks with her brother along the lane. At each house, they knock and wait politely. A neighbor gives them a warm smile. When they return, Lola has sliced their guavas. They sit together and enjoy the fruit.",
    questions: [
      "What fruit does Lola pick?",
      "Where is the fruit tree?",
      "Which guavas do they set aside for lunch?",
      "Who goes with Rosa to visit the neighbors?",
      "What do the children do when they reach each house?",
      "Why might the neighbor smile at the children?",
    ],
  },
];

export function getCustomStoryQuestions(title) {
  const normalized = String(title || "").trim().replace(/\s+/g, " ").toLowerCase();
  const story = CUSTOM_ASSESSMENT_STORIES.find(item => item.title.toLowerCase() === normalized);
  return story ? [...story.questions] : null;
}
