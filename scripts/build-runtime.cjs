/* Cross-platform build steps. Optional vendor usage/update telemetry is disabled;
 * audit and regression gates run before this script in package.json. */
const {
  spawnSync
} = require('node:child_process');
const path = require('node:path');
const env = {
  ...process.env,
  CHECKPOINT_DISABLE: '1',
  NEXT_TELEMETRY_DISABLED: '1'
};
for (const [file, args] of [[path.join(path.dirname(require.resolve('prisma/package.json')), 'build', 'index.js'), ['generate']], [require.resolve('next/dist/bin/next'), ['build']], [path.join(__dirname, 'apply-authorized-roster-purges.cjs'), []]]) {
  const result = spawnSync(process.execPath, [file, ...args], {
    env,
    stdio: 'inherit'
  });
  if (result.error) {
    console.error('Unable to run a required build step.');
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status || 1);
}
