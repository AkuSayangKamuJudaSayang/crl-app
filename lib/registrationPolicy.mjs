export const REGISTRATION_POLICY_VERSION = '2026-11-05';
export function registrationPolicyError(body) {
  return body?.policy_accepted === true && body?.policy_version === REGISTRATION_POLICY_VERSION
    ? '' : 'Please agree to the Terms and Conditions and acknowledge the Privacy Notice before signing up.';
}
