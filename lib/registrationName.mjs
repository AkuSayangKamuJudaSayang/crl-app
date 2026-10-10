const clean = value => String(value ?? "").trim().replace(/\s+/gu, " ");

export function getRegistrationName(body = {}) {
  const structured = ["first_name", "last_name", "middle_name", "suffix"].some(key => Object.hasOwn(body, key));
  if (!structured) {
    const fullName = clean(body.full_name ?? body.fullName);
    return { fullName, fields: {}, error: fullName.length > 100 ? "Name must be 100 characters or fewer." : "" };
  }
  const firstName = clean(body.first_name), lastName = clean(body.last_name);
  const middleName = clean(body.middle_name), nameSuffix = clean(body.suffix);
  if (!lastName) return { error: "Please enter your last name." };
  if (!firstName) return { error: "Please enter your first name." };
  if ([firstName, lastName, middleName].some(name => name.length > 50) || nameSuffix.length > 15) {
    return { error: "Names must be 50 characters or fewer and suffix 15 characters or fewer." };
  }
  const middleInitial = middleName.split(" ").filter(Boolean).map(name => `${Array.from(name)[0].toUpperCase()}.`).join(" ");
  const fullName = [firstName, middleInitial, lastName, nameSuffix].filter(Boolean).join(" ");
  if (fullName.length > 100) return { error: "Name must be 100 characters or fewer." };
  return { fullName, fields: { firstName, lastName, middleName: middleName || null, nameSuffix: nameSuffix || null }, error: "" };
}
