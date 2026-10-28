export function learnerMiddleInitial(learner) {
  const value=String(learner?.middle_name ?? learner?.middleName ?? "").trim();
  if(!value || /^(?:N\/?A|NONE|NULL|NOT APPLICABLE|[-—.])$/i.test(value))return "—";
  const first=Array.from(value.normalize("NFKC"))[0];
  return first.toLocaleUpperCase()+".";
}
