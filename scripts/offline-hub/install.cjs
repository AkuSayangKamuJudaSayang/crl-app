const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const { ensureTls, HOST } = require("./tls.cjs");

const TASK = "CRL Offline Hub";
const UNIT = "crl-offline-hub.service";
const LABEL = "org.crl.offlinehub";
const psQuote = value => "'" + value.replace(/'/g, "''") + "'";
const xml = value => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const unitQuote = value => '"' + value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/%/g, "%%").replace(/\$/g, () => "$$") + '"';

function autostartPlan(platform, root, node, home, uid = 0) {
  if ([root, node, home].some(value => /[\r\n\0]/.test(value))) throw new Error("Unsupported installation path.");
  const runner = path.join(root, "scripts", "offline-hub", "runner.cjs");
  if (platform === "win32") {
    const args = `-NoProfile -NonInteractive -WindowStyle Hidden -Command "& ${psQuote(node)} ${psQuote(runner)}"`;
    const command = `$ErrorActionPreference='Stop'; $user=[Security.Principal.WindowsIdentity]::GetCurrent().Name; $action=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ${psQuote(args)}; $trigger=New-ScheduledTaskTrigger -AtLogOn -User $user; $principal=New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited; $settings=New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew; Register-ScheduledTask -TaskName ${psQuote(TASK)} -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null; Start-ScheduledTask -TaskName ${psQuote(TASK)}`;
    return { command: "powershell.exe", args: ["-NoProfile", "-NonInteractive", "-Command", command] };
  }
  if (platform === "darwin") {
    const file = path.join(home, "Library", "LaunchAgents", `${LABEL}.plist`);
    const contents = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>${LABEL}</string><key>ProgramArguments</key><array><string>${xml(node)}</string><string>${xml(runner)}</string></array><key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>5</integer></dict></plist>`;
    return { file, contents, command: "launchctl", args: ["bootstrap", `gui/${uid}`, file] };
  }
  if (platform === "linux") {
    const file = path.join(home, ".config", "systemd", "user", UNIT);
    const contents = `[Unit]\nDescription=CRL Offline Hub\n[Service]\nExecStart=${unitQuote(node)} ${unitQuote(runner)}\nRestart=on-failure\nRestartSec=5\n[Install]\nWantedBy=default.target\n`;
    return { file, contents, command: "systemctl", args: ["--user", "enable", "--now", UNIT] };
  }
  throw new Error("Install the hub on Windows, macOS or Linux. Phones and tablets connect to it through CRL-App.");
}
function execute(command, args, required = true) {
  const result = spawnSync(command, args, { encoding: "utf8", windowsHide: true });
  if (required && (result.error || result.status !== 0)) throw new Error(result.error?.message || result.stderr || `${command} failed. Ask your school administrator to complete setup.`);
  return result;
}
function install({ uninstall = false } = {}) {
  const home = os.homedir();
  const root = path.join(home, ".crl-offline-hub");
  const platform = process.platform;
  const uid = process.getuid?.() || 0;
  if (uninstall) {
    if (platform === "win32") execute("powershell.exe", ["-NoProfile", "-Command", `Stop-ScheduledTask -TaskName ${psQuote(TASK)} -ErrorAction SilentlyContinue; Unregister-ScheduledTask -TaskName ${psQuote(TASK)} -Confirm:$false -ErrorAction SilentlyContinue`]);
    else if (platform === "darwin") {
      execute("launchctl", ["bootout", `gui/${uid}/${LABEL}`], false);
      const file = path.join(home, "Library", "LaunchAgents", `${LABEL}.plist`);
      if (fs.existsSync(file)) fs.unlinkSync(file);
    } else if (platform === "linux") {
      execute("systemctl", ["--user", "disable", "--now", UNIT]);
      const file = path.join(home, ".config", "systemd", "user", UNIT);
      if (fs.existsSync(file)) fs.unlinkSync(file);
      execute("systemctl", ["--user", "daemon-reload"]);
    } else throw new Error("Unsupported host platform.");
    console.log("Hub autostart removed. Certificate and configuration files were preserved.");
    return;
  }
  if (Number(process.versions.node.split(".")[0]) < 20) throw new Error("Install Node.js 24 LTS before this one-time setup.");
  autostartPlan(platform, root, process.execPath, home, uid);
  const source = path.resolve(__dirname, "../..");
  if (source === root) throw new Error("Run installation from the extracted setup download, not the installed service folder.");
  // The download carries the hub's one runtime dependency; without it the ZIP was not fully extracted.
  const copiedModules = fs.existsSync(path.join(source, "node_modules", "bonjour-service"));
  if (!copiedModules) throw new Error("Extract the complete setup ZIP before installing.");
  // Stop only our registered service before updating its runtime or scripts.
  if (fs.existsSync(path.join(root, "scripts", "offline-hub", "runner.cjs"))) {
    if (platform === "win32") execute("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `Stop-ScheduledTask -TaskName ${psQuote(TASK)} -ErrorAction SilentlyContinue`]);
    else if (platform === "darwin") execute("launchctl", ["bootout", `gui/${uid}/${LABEL}`], false);
    else if (platform === "linux") execute("systemctl", ["--user", "stop", UNIT]);
  }
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  // Never replace the existing certificate authority or saved configuration.
  fs.cpSync(path.join(source, "scripts", "offline-hub"), path.join(root, "scripts", "offline-hub"), { recursive: true });
  fs.copyFileSync(path.join(source, "scripts", "offline-pairing-hub.cjs"), path.join(root, "scripts", "offline-pairing-hub.cjs"));
  // The download contains only the hub's dependency closure.
  fs.cpSync(path.join(source, "node_modules"), path.join(root, "node_modules"), { recursive: true });
  const bin = path.join(root, "bin");
  fs.mkdirSync(bin, { recursive: true });
  const node = path.join(bin, platform === "win32" ? "node.exe" : "node");
  fs.copyFileSync(process.execPath, node);
  fs.chmodSync(node, 0o700);
  const tls = ensureTls(path.join(root, "certificates"));
  const plan = autostartPlan(platform, root, node, home, uid);
  if (plan.file) { fs.mkdirSync(path.dirname(plan.file), { recursive: true }); fs.writeFileSync(plan.file, plan.contents); }
  if (platform === "darwin") execute("launchctl", ["bootout", `gui/${uid}/${LABEL}`], false);
  if (platform === "linux") execute("systemctl", ["--user", "daemon-reload"]);
  execute(plan.command, plan.args);
  console.log("CRL Offline Hub installed. It will start when this computer signs in.");
  console.log("One-time device setup:");
  for (const address of tls.addresses) console.log(`http://${address}:8788/setup`);
  console.log(`Hub: https://${HOST}:8787`);
  console.log(`Certificate: ${path.join(root, "certificates", "CRL-Offline-Root.crt")}`);
  console.log("Ask your school administrator to verify and trust this certificate on every device. Keep the hub computer awake.");
}
module.exports = { autostartPlan, install };
if (require.main === module) {
  try { install({ uninstall: process.argv.includes("--uninstall") }); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
