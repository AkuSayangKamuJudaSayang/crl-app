const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const crypto = require('node:crypto'), bcrypt = require('bcryptjs'), jwt = require('jsonwebtoken');
const strip = path => fs.readFileSync(path, 'utf8').replace(/^import[\s\S]*?;\s*/gm, '').replace(/^export /gm, '');
(async () => {
  const password = 'Synthetic-Only-2026!';
  let state = { users: {}, requests: [], audits: [] }, queue = Promise.resolve();
  const db = {
    $queryRaw: async (sql, id) => { assert.match(sql.join('?'), /WHERE id = \? FOR UPDATE/); return [{ id }]; },
    user: {
      findUnique: async ({ where }) => structuredClone(where.id ? state.users[where.id] : Object.values(state.users).find(u => u.username === where.username) || null),
      findFirst: async ({ where }) => structuredClone(Object.values(state.users).find(u => u.username.toLowerCase() === where.username.equals.toLowerCase()) || null),
      update: async ({ where, data }) => structuredClone(Object.assign(state.users[where.id], data)),
    },
    accountUnlockRequest: {
      findUnique: async ({ where }) => structuredClone(state.requests.find(r => r.id === where.id) || null),
      upsert: async ({ where, create }) => { const k = where.teacherId_lockId; let r = state.requests.find(r => r.teacherId === k.teacherId && r.lockId === k.lockId); if (!r) { r = { ...create, id: crypto.randomUUID(), status: 'pending', createdAt: new Date() }; state.requests.push(r); } return structuredClone(r); },
      updateMany: async ({ where, data }) => { const r = state.requests.find(r => r.id === where.id && r.status === where.status); if (r) Object.assign(r, data); return { count: r ? 1 : 0 }; },
    },
    $transaction(fn) { const task = queue.then(async () => { const before = structuredClone(state); try { return await fn(db); } catch (e) { state = before; throw e; } }); queue = task.catch(() => {}); return task; },
  };
  const ctx = vm.createContext({ crypto, bcrypt, jwt, Date, console, process: { env: { JWT_SECRET: 'synthetic-test-only-key', DATABASE_URL: 'postgresql://test:test@localhost/test' } }, prisma: db, getDatabaseConfigurationStatus: () => ({ configured: true, usable: true }), logSecureError() {}, recordLogin: async () => {},
    NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200, headers: new Map(), cookies: { set() {} } }) },
  });
  vm.runInContext(strip('lib/loginSecurity.js'), ctx);
  vm.runInContext(strip('app/api/auth/route.js'), ctx);
  const hash = await bcrypt.hash(password, 4);
  const seed = role => { state.users[1] = { id: 1, username: 'Synthetic', role, passwordHash: hash, failedLoginAttempts: 0, loginLockedUntil: null, loginLockId: null, adminSessionVersion: 0 }; };
  const req = (pw, scope = 'app') => ({ json: async () => ({ username: 'Synthetic', password: pw, scope }), nextUrl: new URL('https://crl.test/api/auth'), cookies: { get() {} } });
  for (const [role, minutes] of [['teacher', 30], ['admin', 5]]) {
    seed(role);
    for (let i = 1; i <= 6; i++) { const r = await ctx.handleLogin(req('wrong', role === 'admin' ? 'admin' : 'app')); assert.equal(r.status, 401); assert.equal(r.body.attempts_remaining, 7 - i); }
    const r = await ctx.handleLogin(req('wrong')); assert.equal(r.status, 423); assert.equal(r.body.lock_minutes, minutes); assert.equal(r.body.can_request_unlock, role === 'teacher'); assert.equal(Boolean(r.body.unlock_token), role === 'teacher');
    const deadline = +state.users[1].loginLockedUntil;
    assert.ok(deadline - Date.now() > minutes * 60000 - 2000);
    for (const pw of [password, 'another wrong']) assert.equal((await ctx.handleLogin(req(pw))).status, 423);
    assert.equal(+state.users[1].loginLockedUntil, deadline);
    state.users[1].loginLockedUntil = new Date(Date.now() - 1000);
    assert.equal((await ctx.handleLogin(req('wrong'))).body.attempts_remaining, 6);
    assert.equal((await ctx.handleLogin(req(password, role === 'admin' ? 'admin' : 'app'))).status, 200);
    assert.equal(state.users[1].failedLoginAttempts, 0);
    assert.equal(state.users[1].loginLockedUntil, null);
  }
  console.log('PASS teacher/admin login: six failures, seventh locks for 30/5 minutes; correct passwords cannot bypass; deadline does not slide; expiry and successful sign-in reset counters');
  seed('teacher');
  const parallel = await Promise.all(Array.from({ length: 20 }, () => ctx.handleLogin(req('wrong'))));
  assert.equal(parallel.filter(r => r.status === 401).length, 6); assert.equal(state.users[1].failedLoginAttempts, 7);
  const token = parallel.find(r => r.status === 423).body.unlock_token;
  assert.throws(() => jwt.verify(token, 'synthetic-test-only-key'), /signature/, 'An unlock receipt must never verify with the session signing key');
  await Promise.all([ctx.requestAccountUnlock(db, token), ctx.requestAccountUnlock(db, token)]);
  assert.equal(state.requests.length, 1);
  await assert.rejects(() => ctx.requestAccountUnlock(db, token + 'tampered'), /Retry sign-in/);
  const wrongPurpose = jwt.sign({ purpose: 'session', userId: 1, lockId: state.users[1].loginLockId }, crypto.createHmac('sha256', 'synthetic-test-only-key').update('crl-account-unlock-request-v1').digest('hex'), { audience: 'crl-account-unlock' });
  await assert.rejects(() => ctx.requestAccountUnlock(db, wrongPurpose), /Retry sign-in/);
  state.users[1].role = 'admin'; await assert.rejects(() => ctx.requestAccountUnlock(db, token), /lock has ended/); state.users[1].role = 'teacher';
  const requestId = state.requests[0].id, firstLock = state.users[1].loginLockId;
  state.users[1].loginLockId = crypto.randomUUID();
  await assert.rejects(() => ctx.resolveAccountUnlock(db, requestId, 2, true, async () => {}), /lock has ended/);
  state.users[1].loginLockId = firstLock;
  await assert.rejects(() => ctx.resolveAccountUnlock(db, requestId, 2, true, async () => { throw new Error('audit failed'); }), /audit failed/);
  assert.equal(state.users[1].failedLoginAttempts, 7); assert.equal(state.requests[0].status, 'pending');
  const results = await Promise.allSettled([ctx.resolveAccountUnlock(db, requestId, 2, true, async (_, row) => state.audits.push(row)), ctx.resolveAccountUnlock(db, requestId, 3, true, async (_, row) => state.audits.push(row))]);
  assert.equal(results.filter(x => x.status === 'fulfilled').length, 1); assert.equal(state.audits.length, 1); assert.equal(state.users[1].loginLockedUntil, null);
  console.log('PASS concurrent failures, signed-purpose teacher requests, duplicate suppression, stale-lock rejection, atomic audit rollback and concurrent admin resolution');
  seed('teacher'); await Promise.all(Array.from({ length: 7 }, () => ctx.handleLogin(req('wrong')))); state.users[1].twoFactorEnabled = true;
  const challenge = ctx.createTwoFactorChallenge(1, 'app');
  const mfa = await ctx.handleVerifyLogin2FA({ cookies: { get: () => ({ value: challenge }) }, json: async () => ({ code: '123456' }) });
  assert.equal(mfa.status, 423);
  assert.equal((await ctx.handleLogin({ ...req('wrong'), json: async () => ({ username: "' OR 1=1 --", password: 'wrong' }) })).status, 401);
  const adminCtx = vm.createContext({ Date, Number, Map, crypto, process, Buffer, prisma: db, getAdminUser: async () => null, NextResponse: ctx.NextResponse, logSecureError() {}, resolveAccountUnlock: ctx.resolveAccountUnlock });
  vm.runInContext(strip('app/api/admin/route.js'), adminCtx);
  assert.equal((await adminCtx.POST({ json: async () => ({ action: 'approve_unlock', id: requestId }) })).status, 401);
  assert.equal((await adminCtx.GET({ nextUrl: new URL('https://crl.test/api/admin?action=unlock_requests') })).status, 401);
  // Exercise the authenticated administrator route with the same persisted
  // request state used by the login and public request handlers.
  const publicResult = await ctx.handleAccountUnlockRequest({ json: async () => ({ unlock_token: ctx.loginLockPayload(state.users[1]).unlock_token }) });
  assert.equal(publicResult.status, 200);
  db.accountUnlockRequest.findMany = async () => state.requests.map(r => ({ ...r, teacher: state.users[r.teacherId] }));
  adminCtx.getAdminUser = async () => ({ id: 2, role: 'admin' });
  adminCtx.isLoginLocked = vm.runInContext("isLoginLocked", ctx);
  adminCtx.writeAudit = async (_, row) => state.audits.push(row);
  const listed = await adminCtx.GET({ nextUrl: new URL('https://crl.test/api/admin?action=unlock_requests') });
  assert.equal(listed.status, 200);
  assert.equal(listed.body.entries[0].teacher.passwordHash, undefined);
  const activeRequest = state.requests.find(r => r.lockId === state.users[1].loginLockId);
  const approved = await adminCtx.POST({ json: async () => ({ action: 'approve_unlock', id: activeRequest.id }) });
  assert.equal(approved.status, 200); assert.equal(state.users[1].loginLockedUntil, null);
  assert.equal(state.requests.find(r => r.id === activeRequest.id).status, 'approved');
  await assert.rejects(() => ctx.requestAccountUnlock(db, token), /lock has ended/);
  seed('teacher'); await Promise.all(Array.from({ length: 7 }, () => ctx.handleLogin(req('wrong'))));
  await ctx.requestAccountUnlock(db, ctx.loginLockPayload(state.users[1]).unlock_token);
  const dismissId = state.requests.find(r => r.lockId === state.users[1].loginLockId).id;
  await ctx.resolveAccountUnlock(db, dismissId, 2, false, async () => {});
  assert.equal((await ctx.handleLogin(req(password))).status, 423, 'Dismissal must leave the lock in place');
  console.log('PASS pending 2FA cannot bypass a newer lock, SQL-like identifiers are literals, and unauthenticated requests cannot list or approve unlocks');
  const storage = new Map(), local = vm.createContext({ Date, JSON, String, localStorage: { getItem: k => storage.get(k), setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) } });
  vm.runInContext(strip('lib/offlineLoginSecurity.js'), local);
  for (let i = 0; i < 6; i++) assert.equal(local.recordOfflinePasswordResult('Synthetic', false), null);
  assert.equal(local.recordOfflinePasswordResult('Synthetic', false).locked, true);
  assert.equal(local.recordOfflinePasswordResult('synthetic', true).locked, true);
  local.clearLoginLock('Synthetic'); assert.equal(local.cachedLoginLock('synthetic'), null);
  console.log('PASS durable offline failure limit and known lock survive local password retries; an online success can clear the local mirror');
})().catch(e => { console.error(e); process.exitCode = 1; });
