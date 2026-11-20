// Build the Windows package on this machine, as the GitHub "Windows build" workflow does, and copy the
// result into bin/.
//
//   npm run dist:local          tests, build, then the .zip into bin/ (e.g. MechForger-1.0-Beta-win.zip)
//   npm run dist:local -- --all also the installer and portable .exe
//   npm run dist:local -- --skip-tests
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const all = args.has('--all');
const run = (cmd) => {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { cwd: root, stdio: 'inherit', shell: true });
};

if (!args.has('--skip-tests')) run('npm test');
run('npm run build');
// Only the zip unless --all: the installer and portable exe take most of the packaging time.
run(`npx electron-builder --win ${all ? '' : 'zip '}--publish never`);

const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const release = path.join(root, 'release');
const bin = path.join(root, 'bin');
fs.mkdirSync(bin, { recursive: true });
// electron-builder names files with the semver version (1.0.0-beta); bin/ gets the version as the app shows
// it (src/version.ts), with a hyphen for the space: 1.0-Beta.
const [, major, minor, patch, pre] = /^(\d+)\.(\d+)\.(\d+)(?:-([A-Za-z]+))?/.exec(version) ?? [];
const label = !major ? version
  : (patch === '0' ? `${major}.${minor}` : `${major}.${minor}.${patch}`) + (pre ? `-${pre[0].toUpperCase()}${pre.slice(1).toLowerCase()}` : '');
const wanted = [
  [`MechForger-${version}-win.zip`, `MechForger-${label}-win.zip`],
  ...(all ? [
    [`MechForger-Setup-${version}.exe`, `MechForger-Setup-${label}.exe`],
    [`MechForger-Portable-${version}.exe`, `MechForger-Portable-${label}.exe`],
  ] : []),
];
for (const [built, name] of wanted) {
  const from = path.join(release, built);
  if (!fs.existsSync(from)) {
    console.error(`\nExpected ${path.relative(root, from)} but electron-builder did not produce it.`);
    process.exit(1);
  }
  fs.copyFileSync(from, path.join(bin, name));
  console.log(`Copied ${name} -> bin/ (${(fs.statSync(from).size / 1e6).toFixed(1)} MB)`);
}
