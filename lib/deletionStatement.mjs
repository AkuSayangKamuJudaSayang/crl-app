export const LEARNER_DELETIONS = ['delete_learner', 'delete_learners'];
export function deletionStatement(action, body, targets) {
  const identities = (targets || []).map(row => ({id:Number(row.id),lrn:String(row.lrn || "").trim()})).sort((a,b)=>a.id-b.id);
  if (!LEARNER_DELETIONS.includes(action) || !identities.length || identities.length > 1000 || identities.some(row => !Number.isSafeInteger(row.id) || row.id === 0 || !/^\d{10,12}$/.test(row.lrn)) || new Set(identities.map(row=>row.id)).size !== identities.length) throw Error('The selected learner identities are unavailable. Refresh the roster.');
  if (!/^[0-9a-f-]{36}$/i.test(String(body.deletion_nonce || ''))) throw Error('Deletion confirmation is missing. Enter your password again.');
  return { version: 1, action, targets: identities, reason: String(body.deletion_reason || '').trim(), rosterVersion: Number(body.roster_version || 0), nonce: body.deletion_nonce };
}
export const statementBytes = statement => new TextEncoder().encode(JSON.stringify(statement));
export function matchingDeletionStatement(statement, action, body, learners) {
  const expected = deletionStatement(action, body, statement?.targets);
  if (JSON.stringify(statement) !== JSON.stringify(expected)) return false;
  return learners.every(row => expected.targets.some(target => target.id === Number(row.id) && target.lrn === String(row.lrn ?? row.LRN ?? '').trim()));
}
export function certificateClaims(token) {
  const raw = String(token || '').split('.')[1];
  if (!raw) throw Error('Password confirmation is unavailable. Sign in online again.');
  const bytes = Uint8Array.from(atob(raw.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}
