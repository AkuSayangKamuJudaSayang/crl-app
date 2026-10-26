// Encouragement describes effort and the activity, never a reading classification.
export function learnerCompletionMessage(session) {
  const content = session?.current_content ?? session?.currentContent;
  if (content === "ZERO_SCORE_PART1_TASK1" || session?.early_termination === "part1_task1_zero") return "Thank you for trying the letter sounds. Keep practicing, one sound at a time!";
  if (content === "PART1_TOTAL_LOW" || session?.stage === "terminated") return "You worked hard on the letters and words. Keep reading and growing!";
  return "Thank you for reading with us. Keep discovering new stories!";
}
