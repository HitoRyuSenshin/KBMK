import { describe, expect, it } from 'vitest';
import { decideWin32Key } from '../src/hook/vkChar';
import { mapUiohookKey } from '../src/hook/keymap';
import { extractPasteCandidate } from '../src/hook/pasteCandidate';

const base = {
  scanCode: 0,
  resolved: null as string | null,
  shift: false,
  ctrl: false,
  alt: false,
  meta: false,
};

describe('paste detection (M5.14)', () => {
  it('Win32 path: Ctrl+V is a paste event', () => {
    expect(decideWin32Key({ ...base, vkCode: 0x56, ctrl: true })).toEqual([{ type: 'paste' }]);
  });

  it('Win32 path: Ctrl+Shift+V (terminal paste) is also a paste event', () => {
    expect(decideWin32Key({ ...base, vkCode: 0x56, ctrl: true, shift: true })).toEqual([
      { type: 'paste' },
    ]);
  });

  it('Win32 path: Shift+Insert pastes; plain Insert still resets', () => {
    expect(decideWin32Key({ ...base, vkCode: 0x2d, shift: true })).toEqual([{ type: 'paste' }]);
    expect(decideWin32Key({ ...base, vkCode: 0x2d })).toEqual([{ type: 'reset' }]);
  });

  it('Win32 path: Esc is the dismiss-paste hotkey (M5.15, replacing Alt+Space)', () => {
    expect(decideWin32Key({ ...base, vkCode: 0x1b })).toEqual([
      { type: 'hotkey', hotkey: 'dismiss-paste' },
    ]);
  });

  it('Win32 path: Alt+Space is a plain modifier again — it is a Windows system key', () => {
    expect(decideWin32Key({ ...base, vkCode: 0x20, alt: true })).toEqual([{ type: 'modifier' }]);
  });

  it('uiohook path: Ctrl+V (47) pastes, Esc (1) dismisses, Shift+Insert (3666) pastes', () => {
    const raw = { shiftKey: false, ctrlKey: false, altKey: false, metaKey: false };
    expect(mapUiohookKey({ ...raw, keycode: 47, ctrlKey: true })).toEqual({ type: 'paste' });
    expect(mapUiohookKey({ ...raw, keycode: 1 })).toEqual({
      type: 'hotkey',
      hotkey: 'dismiss-paste',
    });
    expect(mapUiohookKey({ ...raw, keycode: 57, altKey: true })).toEqual({ type: 'modifier' });
    expect(mapUiohookKey({ ...raw, keycode: 3666, shiftKey: true })).toEqual({ type: 'paste' });
    expect(mapUiohookKey({ ...raw, keycode: 3666 })).toEqual({ type: 'reset' });
  });
});

describe('extractPasteCandidate (M5.14; multi-word since M5.17)', () => {
  it('accepts a single word, Latin or Bengali; raw keeps the exact pasted text', () => {
    expect(extractPasteCandidate('hola')).toEqual({ raw: 'hola', word: 'hola', suffix: '' });
    expect(extractPasteCandidate('নাম')).toEqual({ raw: 'নাম', word: 'নাম', suffix: '' });
    expect(extractPasteCandidate('  hello  ')).toEqual({
      raw: '  hello  ',
      word: 'hello',
      suffix: '',
    });
  });

  it('splits one trailing punctuation mark off a single word only', () => {
    expect(extractPasteCandidate('hello.')).toEqual({ raw: 'hello.', word: 'hello', suffix: '.' });
    expect(extractPasteCandidate('শব্দ।')).toEqual({ raw: 'শব্দ।', word: 'শব্দ', suffix: '।' });
  });

  it('accepts phrases and short sentences, digits included', () => {
    expect(extractPasteCandidate('buenos días a todos')).toEqual({
      raw: 'buenos días a todos',
      word: 'buenos días a todos',
      suffix: '',
    });
    expect(extractPasteCandidate('I have 2 cats and 1 dog.')).toEqual({
      raw: 'I have 2 cats and 1 dog.',
      word: 'I have 2 cats and 1 dog.',
      suffix: '',
    });
    expect(extractPasteCandidate('তুমি কেমন আছো')).not.toBeNull();
  });

  it('rejects links, emails, paths — including as one token of a phrase', () => {
    expect(extractPasteCandidate('https://example.com')).toBeNull();
    expect(extractPasteCandidate('user@example.com')).toBeNull();
    expect(extractPasteCandidate('visit www.example.com today')).toBeNull();
    expect(extractPasteCandidate('mail me at user@example.com please')).toBeNull();
    expect(extractPasteCandidate('C:\\path\\file')).toBeNull();
    expect(extractPasteCandidate('and/or')).toBeNull();
  });

  it('rejects multi-line, tabbed, letter-less and over-long pastes', () => {
    expect(extractPasteCandidate('hello\nworld')).toBeNull();
    expect(extractPasteCandidate('hello\tworld')).toBeNull();
    expect(extractPasteCandidate('12345')).toBeNull();
    expect(extractPasteCandidate('')).toBeNull();
    expect(extractPasteCandidate('word '.repeat(70))).toBeNull(); // 350 chars
    expect(extractPasteCandidate('x'.repeat(301))).toBeNull();
  });
});
