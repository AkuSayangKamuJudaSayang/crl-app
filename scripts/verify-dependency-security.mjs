/*
 * Keeps the dependency set clean.
 *
 * The app shipped a set of high-severity advisories, and clearing them meant
 * more than bumping versions: two of the offending packages have no fixed
 * release at all, so the code that used them was rewritten and the packages
 * removed. `npm audit` is the real check, but it needs the network and it reads
 * the registry rather than this checkout, so this script pins the outcome: the
 * packages that had to go are gone, the ones that had to move are at or above
 * the release that fixed them, and the offline hub still builds its own
 * certificates rather than reaching for a library again.
 *
 * Runs as part of npm run verify:assessment, so it gates every build.
 */
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
};

const manifest = JSON.parse(readFileSync("package.json", "utf8"));
const declared = {
  ...(manifest.dependencies || {}),
  ...(manifest.devDependencies || {}),
};

function installedVersion(name) {
  const path = `node_modules/${name}/package.json`;
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")).version || null;
}

/* Returns true when left is at or above right, comparing dotted numbers. */
function atLeast(left, right) {
  const a = String(left).split(".").map((part) => Number.parseInt(part, 10) || 0);
  const b = String(right).split(".").map((part) => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const one = a[index] || 0;
    const two = b[index] || 0;
    if (one !== two) return one > two;
  }
  return true;
}

/*
 * Packages removed outright. Two of them - node-forge and the registry copy of
 * xlsx - have no fixed release, and exceljs was never imported, while
 * eslint-config-next pulled a copy of braces that cannot be patched.
 */
console.log("=== removed packages stay removed ===");
for (const name of [
  "node-forge",
  "exceljs",
  "eslint",
  "eslint-config-next",
  "braces",
]) {
  check(
    `${name} is neither declared nor installed`,
    !Object.prototype.hasOwnProperty.call(declared, name) && installedVersion(name) === null,
    installedVersion(name) || "absent"
  );
}

/*
 * Packages that had to move to a release that carries the fix. The floors come
 * from the advisories themselves.
 */
console.log("\n=== patched packages stay patched ===");
for (const [name, floor, present] of [
  ["xlsx", "0.20.2", true],
  ["postcss", "8.5.23", true],
  ["source-map-js", "1.2.2", true],
  ["deepmerge-ts", "8.0.0", true],
  ["brace-expansion", "1.1.21", false],
]) {
  const version = installedVersion(name);
  if (!version) {
    check(
      `${name} is absent or patched`,
      !present,
      present ? "expected at or above " + floor : "absent"
    );
    continue;
  }
  /* brace-expansion's 2.x line has its own floor; 2.1.7 was fixed with 1.1.21. */
  const ok = atLeast(version, floor) || (name === "brace-expansion" && atLeast(version, "2.1.7"));
  check(`${name} is at or above ${floor}`, ok, version);
}

check(
  "the registry xlsx is replaced by the vendor's patched build",
  /^https:\/\/cdn\.sheetjs\.com\/xlsx-0\.20\.3\/xlsx-0\.20\.3\.tgz$/.test(
    String(declared.xlsx || "")
  ),
  String(declared.xlsx)
);

/*
 * Two packages are only held at a safe version by an override, because their
 * parents pin the vulnerable one exactly. Losing the override would silently
 * restore the advisory on the next install.
 */
console.log("\n=== the overrides that hold the fixes ===");
const overrides = manifest.overrides || {};
check("postcss is overridden", Boolean(overrides.postcss), String(overrides.postcss));
check(
  "deepmerge-ts is overridden",
  Boolean(overrides["deepmerge-ts"]),
  String(overrides["deepmerge-ts"])
);
check(
  "the postcss override is at or above the fix",
  atLeast(String(overrides.postcss || "").replace(/^[^\d]*/, ""), "8.5.23"),
  String(overrides.postcss)
);
check(
  "the deepmerge-ts override is the fixed major",
  atLeast(String(overrides["deepmerge-ts"] || "").replace(/^[^\d]*/, ""), "8.0.0"),
  String(overrides["deepmerge-ts"])
);

/* The hub's certificates are built from node:crypto, not a library. */
console.log("\n=== the offline hub builds its own certificates ===");
const tls = readFileSync("scripts/offline-hub/tls.cjs", "utf8");
check(
  "the hub does not require node-forge",
  !/require\("node-forge"\)/.test(tls) && !/node-forge/.test(tls)
);
check(
  "the hub signs with node:crypto",
  /require\("node:crypto"\)/.test(tls) && /signWith\(\s*"sha256"/.test(tls)
);
check(
  "the setup download no longer bundles node-forge",
  !/addPackage\("node-forge"\)/.test(readFileSync("scripts/build-offline-hub.cjs", "utf8"))
);

console.log(
  failures
    ? `\n${failures} DEPENDENCY CHECK(S) FAILED`
    : "\nVerified dependencies: the advisories' packages are gone or patched, and the overrides that hold them are in place."
);
void require;
process.exit(failures ? 1 : 0);
