import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { getRegistrationPasswordChecks, getRegistrationPasswordError } from "../lib/registrationPassword.mjs";

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
    getRegistrationPasswordError, console,
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
  const response = await context.signup({ json: async () => ({ ...body, password: accepted, confirm_password: accepted }) });
  assert.equal(response.status, 409, "A matching compliant password must reach the existing username validation");
  assert.equal(queries, 1);
  console.log(`PASS ${path}: password requirements and exact confirmation are enforced before database writes`);
}
console.log("PASS registration policy supports Unicode, rejects whitespace-only symbols, and keeps exact password confirmation");
