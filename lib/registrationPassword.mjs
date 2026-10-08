export function getRegistrationPasswordChecks(password) {
  const value = typeof password === "string" ? password : "";
  return [
    { id: "length", label: "At least 12 characters", met: Array.from(value).length >= 12 },
    { id: "uppercase", label: "An uppercase letter", met: /\p{Lu}/u.test(value) },
    { id: "number", label: "A number", met: /\p{Nd}/u.test(value) },
    { id: "special", label: "A special character", met: /[^\p{L}\p{N}\s]/u.test(value) },
  ];
}

export function getRegistrationPasswordError(password, confirmation) {
  if (!getRegistrationPasswordChecks(password).every(check => check.met)) {
    return "Use at least 12 characters, an uppercase letter, a number, and a special character.";
  }
  if (typeof confirmation !== "string" || !confirmation) return "Please confirm your password.";
  if (password !== confirmation) return "Passwords do not match.";
  return "";
}
