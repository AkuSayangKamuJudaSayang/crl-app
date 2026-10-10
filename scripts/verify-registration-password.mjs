import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { getRegistrationPasswordChecks, getRegistrationPasswordError } from "../lib/registrationPassword.mjs";

import { getRegistrationName } from "../lib/registrationName.mjs";

const accepted = "Teacher2026!Pass";
const rejected = ["Teacher12!", "teacher2026!pass", "TeacherOnly!Pass", "Teacher2026Pass", "Teacher2026 Pass", "Teacher2026éPass"];
for (const password of rejected) assert.ok(getRegistrationPasswordError(password, password), "Each required password property must be enforced");
assert.equal(getRegistrationPasswordError(accepted, accepted), "");
assert.match(getRegistrationPasswordError(accepted, ""), /confirm/);
assert.match(getRegistrationPasswordError(accepted, accepted + " "), /do not match/);
assert.match(getRegistrationPasswordError(accepted, undefined), /confirm/);
assert.equal(getRegistrationPasswordChecks("A1!😀😀😀😀😀")[0].met, false, "Surrogate pairs must not inflate character counts");
assert.equal(getRegistrationPasswordError("École2026!Long", "École2026!Long"), "");

const body = { invite_code: "TESTONLY", full_name: "Test Teacher", section: "A", school_id: "123456", school_name: "Test School", username: "teacher_test" };
for (const path of ["app/api/auth/register/route.js", "app/api/auth/route.js"]) {
  const source = fs.readFileSync(path, "utf8");
  const register = path.includes("/register/");
  const start = source.indexOf(register ? "export async function POST(" : "async function handleSignup(");
  const end = register ? source.length : source.indexOf("async function handleVerify(", start);
  let queries = 0;
  const context = vm.createContext({
    getRegistrationPasswordError, getRegistrationName, console,
    jsonResponse: (data, status = 200) => ({ data, status }),
    prisma: { user: { findUnique: async () => { queries++; return { id: 1 }; } } },
  });
  vm.runInContext(source.slice(start, end).replace("export async function", "async function") + `\nglobalThis.signup = ${register ? "POST" : "handleSignup"};`, context);
  for (const password of rejected) {
    const response = await context.signup({ json: async () => ({ ...body, password, confirm_password: password }) });
    assert.equal(response.status, 400);
    assert.equal(queries, 0, "Invalid credentials must be rejected before any database access or invite consumption");
  }
  for (const confirmation of [undefined, "", accepted + " "]) {
    const response = await context.signup({ json: async () => ({ ...body, password: accepted, confirm_password: confirmation }) });
    assert.equal(response.status, 400);
    assert.equal(queries, 0);
  }
  for (const [names, expected] of [[{ first_name: "Ana", last_name: "" }, /last name/], [{ first_name: "", last_name: "Cruz" }, /first name/]]) {
    const invalidName = await context.signup({ json: async () => ({ ...body, ...names, password: accepted, confirm_password: accepted }) });
    assert.equal(invalidName.status, 400);
    assert.match(invalidName.data.error, expected);
    assert.equal(queries, 0, "Missing names must be rejected before consuming an invite or querying users");
  }
  const response = await context.signup({ json: async () => ({ ...body, password: accepted, confirm_password: accepted }) });
  assert.equal(response.status, 409, "A matching compliant password must reach the existing username validation");
  assert.equal(queries, 1);
  let written, inviteConsumed = false;
  context.prisma.user.findUnique = async () => null;
  context.prisma.inviteCode = { findUnique: async () => ({ id: 1, isUsed: false }) };
  context.prisma.$transaction = async callback => callback({
    user: { create: async ({ data }) => { written = data; return { id: 7, ...data }; } },
    inviteCode: { update: async () => { inviteConsumed = true; } },
  });
  context.bcrypt = { hash: async () => "test-hash" };
  context.createToken = () => "test-token";
  context.serializeUser = user => user;
  context.setAuthCookie = () => {};
  const created = await context.signup({ json: async () => ({ ...body, first_name: "Ana", last_name: "Cruz", middle_name: "Maria Clara", suffix: "III", password: accepted, confirm_password: accepted }) });
  assert.equal(created.status, 200);
  assert.equal(written.fullName, "Ana M. C. Cruz III");
  assert.equal(written.middleName, "Maria Clara");
  assert.equal(written.firstName, "Ana");
  assert.equal(written.lastName, "Cruz");
  assert.equal(written.nameSuffix, "III");
  assert.equal(inviteConsumed, true);
  console.log(`PASS ${path}: password and name validation precede database access; structured names are written inside the existing invite transaction`);
}
console.log("PASS registration policy supports Unicode, rejects whitespace-only symbols, and keeps exact password confirmation");

const structured = getRegistrationName({ first_name: "Theo Lorenzo", last_name: "Gorospe", middle_name: "Maria Clara", suffix: "Jr." });
assert.equal(structured.fullName, "Theo Lorenzo M. C. Gorospe Jr.");
assert.equal(structured.fields.middleName, "Maria Clara");
assert.equal(getRegistrationName({ first_name: "Ana", last_name: "Cruz" }).fullName, "Ana Cruz");
assert.match(getRegistrationName({ first_name: "Ana", last_name: "" }).error, /last name/);
assert.match(getRegistrationName({ first_name: "", last_name: "Cruz" }).error, /first name/);
assert.equal(getRegistrationName({ full_name: "Existing Teacher" }).fullName, "Existing Teacher");
assert.ok(getRegistrationName({ first_name: "A".repeat(51), last_name: "Cruz" }).error);
console.log("PASS structured teacher names preserve full middle names, display initials and suffix, validate required names and keep legacy account compatibility");
