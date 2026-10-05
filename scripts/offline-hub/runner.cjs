const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const root = path.resolve(__dirname, "../..");
const logPath = path.join(root, "hub.log");
let child;
let timer;
let stopping = false;
function run() {
  if (stopping) return;
  if (fs.existsSync(logPath) && fs.statSync(logPath).size > 5 * 1024 * 1024) fs.renameSync(logPath, path.join(root, "hub-previous.log"));
  const log = fs.openSync(logPath, "a", 0o600);
  child = spawn(process.execPath, [path.join(__dirname, "service.cjs")], { stdio: ["ignore", log, log], windowsHide: true });
  fs.closeSync(log);
  child.once("error", error => { fs.appendFileSync(logPath, `${error.message}\n`); });
  child.once("exit", () => { if (!stopping) timer = setTimeout(run, 5000); });
}
function stop() { stopping = true; clearTimeout(timer); child?.kill("SIGTERM"); }
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
run();
