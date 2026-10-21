import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Regression guard for the M5.3 block-list fix. The Win32 out-parameter
 * for GetWindowThreadProcessId / QueryFullProcessImageNameW must be
 * declared 'void *' (backed by a Buffer) — the idiom the keyboard hook
 * proves works with koffi on Windows. A typed 'uint32 *' declaration
 * left the pid buffer at zero, so foreground detection quietly
 * returned null and the block list never enforced.
 */
const foreground = readFileSync(join(__dirname, '../src/main/foregroundApp.ts'), 'utf8');
const openWindows = readFileSync(join(__dirname, '../src/main/openWindows.ts'), 'utf8');

describe('Win32 FFI idioms', () => {
  it('foregroundApp.ts uses no typed primitive pointer out-params', () => {
    expect(foreground).not.toContain("'uint32 *',");
    expect(foreground).toContain('GetWindowThreadProcessId');
  });

  it('openWindows.ts uses no typed primitive pointer out-params', () => {
    expect(openWindows).not.toContain("'uint32 *',");
    expect(openWindows).toContain('GetWindowThreadProcessId');
  });
});
