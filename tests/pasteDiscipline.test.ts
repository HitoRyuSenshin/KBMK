import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Regression guards for the 2026-10-21 user test (M7):
 *
 * 1. The accept swap pasted the user's OLD clipboard text in Chrome:
 *    the injector restored the clipboard 60 ms after sending Ctrl+V,
 *    and a busy app processed the paste after the restore. The paste
 *    path must verify its clipboard write actually took (retry once,
 *    then fail loudly) and must wait well beyond 60 ms — with the
 *    delimiter already re-emitted — before restoring.
 *
 * 2. Fast typing lost first letters ("you" reached the buffer as
 *    "ou"): the Win32 hook dropped ALL events while a swap was
 *    injecting, including the user's real keys. Every synthetic key
 *    carries INJECT_MAGIC, so the magic check alone is the gate.
 */
const windowsInjector = readFileSync(
  join(__dirname, '../src/inject/WindowsTextInjector.ts'),
  'utf8',
);
const linuxInjector = readFileSync(
  join(__dirname, '../src/inject/LinuxTextInjector.ts'),
  'utf8',
);
const win32Hook = readFileSync(join(__dirname, '../src/hook/Win32LayoutKeyHook.ts'), 'utf8');

describe('clipboard paste discipline (M7 fix)', () => {
  it('windows injector verifies the clipboard write and waits 250 ms before restoring', () => {
    expect(windowsInjector).toContain('clipboard.readText() !== replacement');
    expect(windowsInjector).toContain('await sleep(250)');
    expect(windowsInjector).not.toContain('await sleep(60)');
    // The delimiter is re-emitted before the restore wait begins.
    const pasteAt = windowsInjector.indexOf('planPasteShortcut()');
    const delimiterAt = windowsInjector.indexOf('planDelimiter(delimiter)');
    const waitAt = windowsInjector.indexOf('await sleep(250)');
    expect(pasteAt).toBeGreaterThan(-1);
    expect(delimiterAt).toBeGreaterThan(pasteAt);
    expect(waitAt).toBeGreaterThan(delimiterAt);
  });

  it('linux injector verifies the clipboard write and waits 250 ms before restoring', () => {
    expect(linuxInjector).toContain('clipboard.readText() !== text');
    expect(linuxInjector).toContain('await sleep(250)');
    expect(linuxInjector).not.toContain('await sleep(60)');
  });

  it('win32 hook gates on INJECT_MAGIC alone, not on the injecting flag', () => {
    expect(win32Hook).toContain('if (extraInfo !== INJECT_MAGIC) {');
    expect(win32Hook).not.toContain('extraInfo !== INJECT_MAGIC && !this.injecting');
  });
});
