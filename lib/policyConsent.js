export const POLICY_CONSENT_STORAGE_KEY = "crl_policy_consent_v1";
export const POLICY_CONSENT_COOKIE = "crl_policy_consent=v1";

export function hasPolicyConsent() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return false;
  }

  try {
    if (
      window.localStorage.getItem(POLICY_CONSENT_STORAGE_KEY) === "accepted"
    ) {
      return true;
    }
  } catch {
    // The cookie remains available when local storage is blocked.
  }

  return document.cookie
    .split(";")
    .map((item) => item.trim())
    .includes(POLICY_CONSENT_COOKIE);
}
