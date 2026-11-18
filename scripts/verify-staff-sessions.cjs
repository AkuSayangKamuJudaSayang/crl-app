const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const { transform } = require('next/dist/build/swc');

(async () => {
  const jose = await import('jose');
  const secret = 'synthetic-test-staff-session-key';
  const users = new Map([
    [11, { id: 11, role: 'teacher', username: 'example-teacher', schoolId: '123456', isActive: true, adminSessionVersion: 0 }],
    [22, { id: 22, role: 'reading_coordinator', schoolId: '123456', isActive: true, adminSessionVersion: 0 }],
    [33, { id: 33, role: 'admin', schoolId: '123456', isActive: true, adminSessionVersion: 0 }],
  ]);
  const revocations = new Map();
  let unavailable = false;
  const db = {
    user: {
      findUnique: async ({ where }) => users.get(where.id) || null,
      updateMany: async ({ where }) => {
        const user = users.get(where.id);
        if (user?.role !== where.role || user.adminSessionVersion !== where.adminSessionVersion) return { count: 0 };
        user.adminSessionVersion++;
        return { count: 1 };
      },
    },
    school: { findFirst: async () => ({ id: '123456' }) },
    revokedStaffSession: {
      findUnique: async ({ where }) => revocations.get(where.sessionKey),
      upsert: async ({ where, create }) => {
        if (unavailable) throw Error('Database unavailable');
        if (!revocations.has(where.sessionKey)) revocations.set(where.sessionKey, create);
      },
      deleteMany: async () => {},
    },
    $transaction: async work => work(db),
  };
  const NextResponse = {
    json: (body, { status = 200 } = {}) => {
      const cookies = new Map();
      return { status, body, cookies };
    },
  };
  async function load(file, dependencies = {}) {
    const module = { exports: {} };
    const { code } = await transform(fs.readFileSync(file, 'utf8'), {
      filename: file, jsc: { parser: { syntax: 'ecmascript' } }, module: { type: 'commonjs' },
    });
    vm.runInNewContext(code, {
      module, exports: module.exports, process: { env: { JWT_SECRET: secret } },
      Date, Buffer, TextEncoder, URL, console: { error() {} },
      require: name => dependencies[name] || (name.startsWith('.') ? {} : require(name)),
    });
    return module.exports;
  }
  const sessions = await load('lib/staffSessions.js', { './prisma': { prisma: db } });
  const teacher = await load('lib/auth.js', { './staffSessions': sessions, './prisma': { prisma: db }, jose, 'next/headers': {} });
  const portal = await load('lib/portalAuth.js', { './staffSessions': sessions, './prisma': { prisma: db }, jose, 'next/headers': {} });
  const auth = await load('app/api/auth/route.js', {
    '../../../lib/staffSessions': sessions, '../../../lib/prisma': { prisma: db },
    '../../../lib/security': { enforceSensitiveRate: async () => null, logSecureError() {} },
    'next/server': { NextResponse },
  });
  const access = await load('app/api/access/route.js', {
    '../../../lib/portalAuth': portal, '../../../lib/prisma': { prisma: db }, 'next/server': { NextResponse },
  });
  const request = (path, { cookies = {}, bearer, method = 'GET', body = {} } = {}) => ({
    url: 'https://example.test' + path, nextUrl: new URL('https://example.test' + path),
    method, clone() { return this; }, json: async () => body,
    headers: { get: key => key === 'authorization' && bearer ? 'Bearer ' + bearer : null },
    cookies: { get: name => cookies[name] ? { value: cookies[name] } : undefined },
  });
  const payload = { id: 11, role: 'teacher', scope: 'app', session_version: 0 };
  const sid = crypto.randomUUID();
  const sign = extra => jwt.sign({ ...payload, ...extra }, secret, { expiresIn: '7d' });
  const first = sign({ sid }), second = sign({ sid: crypto.randomUUID() });
  const offline = sign({ sid, type: 'teacher_offline_session' });
  const verify = '/api/auth?action=verify', logout = '/api/auth?action=logout';
  assert.equal((await auth.GET(request(logout, { cookies: { crla_token: first } }))).status, 405);
  assert.equal((await auth.GET(request(verify, { cookies: { crla_token: first } }))).status, 200);
  const end = request(logout, { cookies: { crla_token: first }, bearer: offline, method: 'POST' });
  unavailable = true;
  assert.equal((await auth.POST(end)).status, 503);
  assert.ok(await teacher.getAuthenticatedUser(request(verify, { bearer: offline })));
  unavailable = false;
  assert.equal((await auth.POST(end)).status, 200);
  assert.equal((await auth.GET(request(verify, { cookies: { crla_token: first } }))).status, 401);
  assert.equal(await teacher.getAuthenticatedUser(request(verify, { bearer: offline })), null);
  assert.ok(await teacher.getAuthenticatedUser(request(verify, { bearer: second })));
  assert.equal((await auth.POST(end)).status, 200);
  assert.equal(revocations.size, 1);

  for (const id of [22, 33]) {
    const user = users.get(id), role = user.role;
    const token = await portal.signPortalToken(user), keep = await portal.signPortalToken(user);
    assert.notEqual(keep, token);
    const cookie = portal.portalCookie(role), path = '/api/access?role=' + role;
    const end = request(path, { cookies: { [cookie]: token }, method: 'POST', body: { action: 'logout' } });
    assert.ok(await portal.getPortalUser(end, role));
    assert.equal((await access.POST(end)).status, 200);
    assert.equal(await portal.getPortalUser(end, role), null);
    assert.ok(await portal.getPortalUser(request(path, { cookies: { [cookie]: keep } }), role));
  }

  const legacy = sign({}), legacyOffline = sign({ type: 'teacher_offline_session' });
  assert.equal((await auth.POST(request(logout, { cookies: { crla_token: legacy }, method: 'POST' }))).status, 200);
  assert.equal(await teacher.getAuthenticatedUser(request(verify, { bearer: legacyOffline })), null);
  assert.equal(users.get(11).adminSessionVersion, 1);
  console.log('PASS staff session revocation: teacher POST, offline grant, failed write and retry, legacy credential, both portal roles and independent browser sessions');
})().catch(error => { console.error(error); process.exitCode = 1; });
