import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { IPC } from '../src/shared/types';

/**
 * Regression test for the M1 dropdown bug: the sandboxed preload must not
 * require any relative module at runtime, and its hard-coded channel
 * literals must match the IPC constants the main process listens on.
 */
const preloadSource = readFileSync(
  join(__dirname, '../src/preload/preload.ts'),
  'utf8',
);

describe('preload (sandbox safety)', () => {
  it('has no runtime import from a relative module', () => {
    const runtimeImports = preloadSource
      .split('\n')
      .filter((line) => /^\s*import\s/.test(line) && !/^\s*import\s+type\s/.test(line));
    for (const line of runtimeImports) {
      expect(line).not.toMatch(/from\s+['"]\./);
    }
  });

  it('channel literals match shared IPC constants', () => {
    for (const value of Object.values(IPC)) {
      expect(preloadSource).toContain(`'${value}'`);
    }
  });
});
