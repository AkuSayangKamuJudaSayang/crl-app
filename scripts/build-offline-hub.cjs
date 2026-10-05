const fs = require("node:fs");
const path = require("node:path");
const JSZip = require("jszip");
async function build() {
  const zip = new JSZip();
  const folder = zip.folder("CRL-Offline-Setup");
  async function addDirectory(source, target) {
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
      const file = path.join(source, entry.name);
      const relative = `${target}/${entry.name}`;
      if (entry.isDirectory()) await addDirectory(file, relative);
      else if (entry.isFile()) folder.file(relative, fs.readFileSync(file));
    }
  }
  folder.file("scripts/offline-pairing-hub.cjs", fs.readFileSync("scripts/offline-pairing-hub.cjs"));
  await addDirectory("scripts/offline-hub", "scripts/offline-hub");
  const packages = new Set();
  async function addPackage(name, from = process.cwd()) {
    if (name.startsWith("@types/") || packages.has(name)) return;
    let root = path.dirname(require.resolve(name, { paths: [from] }));
    while (!fs.existsSync(path.join(root, "package.json")) || JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).name !== name) {
      const parent = path.dirname(root);
      if (parent === root) throw new Error(`Could not locate ${name}`);
      root = parent;
    }
    const packageFile = path.join(root, "package.json");
    packages.add(name);
    const pkg = JSON.parse(fs.readFileSync(packageFile, "utf8"));
    await addDirectory(root, `node_modules/${name}`);
    for (const dependency of Object.keys(pkg.dependencies || {})) await addPackage(dependency, root);
  }
  await addPackage("node-forge");
  await addPackage("bonjour-service");
  folder.file("Install-Windows.cmd", '@echo off\r\ncd /d "%~dp0"\r\nwhere node >nul 2>nul\r\nif errorlevel 1 (\r\n echo Install Node.js 24 LTS from nodejs.org first.\r\n start https://nodejs.org/en/download\r\n pause\r\n exit /b 1\r\n)\r\nnode "scripts\\offline-hub\\install.cjs"\r\npause\r\n');
  const unix = '#!/bin/sh\ncd -- "$(dirname -- "$0")" || exit 1\nif ! command -v node >/dev/null 2>&1; then printf "Install Node.js 24 LTS from nodejs.org first.\\n"; exit 1; fi\nnode scripts/offline-hub/install.cjs\n';
  folder.file("Install-macOS.command", unix, { unixPermissions: 0o755 });
  folder.file("Install-Linux.sh", unix, { unixPermissions: 0o755 });
  folder.file("Setup-guide.md", fs.readFileSync("docs/offline-pairing-hub.md"));
  const output = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", platform: "UNIX" });
  fs.mkdirSync("public/offline-hub", { recursive: true });
  fs.writeFileSync("public/offline-hub/CRL-Offline-Setup.zip", output);
  console.log(`Offline hub setup packaged: ${output.length} bytes; ${packages.size} runtime packages.`);
}
build().catch(error => { console.error(error); process.exitCode = 1; });
