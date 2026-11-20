import pkg from '../package.json';

/** "1.0.0-beta" -> "1.0 Beta": the version as shown to people (package.json keeps the semver form). */
export function displayVersion(semver: string): string {
  const [, major, minor, patch, pre] = /^(\d+)\.(\d+)\.(\d+)(?:-([A-Za-z]+)[.-]?(\d*))?/.exec(semver) ?? [];
  if (!major) return semver;
  const base = patch === '0' ? `${major}.${minor}` : `${major}.${minor}.${patch}`;
  return pre ? `${base} ${pre[0].toUpperCase()}${pre.slice(1).toLowerCase()}` : base;
}

export const APP_VERSION = displayVersion(pkg.version);
