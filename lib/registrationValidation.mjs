// Staff registration validation shared by teacher/coordinator and server.
export const normalizeRegistrationUsername = value => String(value ?? '').trim().toLowerCase();
export const isValidRegistrationUsername = value =>
  /^[a-z0-9_.-]{3,50}$/.test(normalizeRegistrationUsername(value));
export const isValidRegistrationEmail = value => {
  const email = String(value ?? '').trim();
  return email.length <= 254 && /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(email);
};
