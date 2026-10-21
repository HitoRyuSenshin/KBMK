import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  X11_KEYSYM,
  planX11Backspaces,
  planX11Delimiter,
  planX11PasteShortcut,
} from '../src/inject/x11Plan';
import { LinuxTextInjector } from '../src/inject/LinuxTextInjector';

describe('x11Plan', () => {
  it('backspaces are press/release pairs of the BackSpace keysym', () => {
    const actions = planX11Backspaces(3);
    expect(actions).toHaveLength(6);
    for (let i = 0; i < 3; i++) {
      expect(actions[i * 2]).toEqual({ keysym: X11_KEYSYM.BACKSPACE, press: true });
      expect(actions[i * 2 + 1]).toEqual({ keysym: X11_KEYSYM.BACKSPACE, press: false });
    }
    expect(planX11Backspaces(0)).toEqual([]);
  });

  it('the paste shortcut holds Ctrl, taps V, releases in reverse', () => {
    expect(planX11PasteShortcut()).toEqual([
      { keysym: X11_KEYSYM.CONTROL_L, press: true },
      { keysym: X11_KEYSYM.V, press: true },
      { keysym: X11_KEYSYM.V, press: false },
      { keysym: X11_KEYSYM.CONTROL_L, press: false },
    ]);
  });

  it('whitespace delimiters are real keys; punctuation is a paste plan', () => {
    expect(planX11Delimiter(' ')).toEqual({
      kind: 'keys',
      actions: [
        { keysym: X11_KEYSYM.SPACE, press: true },
        { keysym: X11_KEYSYM.SPACE, press: false },
      ],
    });
    expect(planX11Delimiter('\n')).toMatchObject({ kind: 'keys' });
    expect(planX11Delimiter('\t')).toMatchObject({ kind: 'keys' });
    expect(planX11Delimiter('.')).toEqual({ kind: 'paste', text: '.' });
    expect(planX11Delimiter('।')).toEqual({ kind: 'paste', text: '।' });
    expect(planX11Delimiter('!')).toEqual({ kind: 'paste', text: '!' });
  });
});

describe('LinuxTextInjector construction', () => {  it('never throws in a headless environment; replaceWord rejects when unavailable', async () => {
    const injector = new LinuxTextInjector();
    // In the test VM there is no X display on DISPLAY and libXtst is not
    // installed system-wide, so the injector must report unavailable —
    // and if a future test environment does have X, this test only
    // asserts the unavailable path when it actually is unavailable.
    if (!injector.available) {
      expect(injector.unavailableReason).toBeTruthy();
      await expect(injector.replaceWord(4, 'hello', ' ')).rejects.toThrow(
        /unavailable/,
      );
    }
  });
});

describe('LinuxTextInjector FFI argument types (regression guard)', () => {
  it('passes is_press to XTestFakeKeyEvent as a number, never a boolean', () => {
    // Koffi throws "Unexpected Boolean value, expected number" when a JS
    // boolean is passed for a numeric parameter — this exact bug made
    // every Linux replacement fail on the first synthetic key while the
    // translation itself succeeded (user log, 2026-10-18).
    const source = readFileSync(
      new URL('../src/inject/LinuxTextInjector.ts', import.meta.url),
      'utf8',
    );
    expect(source).toContain('action.press ? 1 : 0');
    expect(source).not.toContain('keycode, action.press,');
  });
});
