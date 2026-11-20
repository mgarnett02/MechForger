import { describe, expect, it } from 'vitest';
import { APP_VERSION, displayVersion } from './version';

describe('version', () => {
  it('shows the semver version in a readable form', () => {
    expect(displayVersion('1.0.0-beta')).toBe('1.0 Beta');
    expect(displayVersion('1.2.3')).toBe('1.2.3');
    expect(displayVersion('2.1.0')).toBe('2.1');
    expect(APP_VERSION).toBe('1.0 Beta');
  });
});
