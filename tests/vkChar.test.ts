import { describe, expect, it } from 'vitest';
import {
  VK,
  classifyText,
  decideWin32Key,
  vkFallbackText,
  type Win32KeyInput,
} from '../src/hook/vkChar';

const input = (over: Partial<Win32KeyInput>): Win32KeyInput => ({
  vkCode: 0,
  scanCode: 0,
  resolved: null,
  shift: false,
  ctrl: false,
  alt: false,
  meta: false,
  ...over,
});

describe('classifyText', () => {
  it('splits text into chars and spec delimiters', () => {
    expect(classifyText('ami.')).toEqual([
      { type: 'char', char: 'a' },
      { type: 'char', char: 'm' },
      { type: 'char', char: 'i' },
      { type: 'delimiter', char: '.' },
    ]);
    expect(classifyText(' ')).toEqual([{ type: 'delimiter', char: ' ' }]);
    expect(classifyText('\r')).toEqual([{ type: 'delimiter', char: '\n' }]);
  });

  it('keeps Bengali letters and combining marks as chars', () => {
    const events = classifyText('আমি');
    expect(events.every((e) => e.type === 'char')).toBe(true);
    expect(events.map((e) => e.char).join('')).toBe('আমি');
  });
});

describe('decideWin32Key — Avro / VK_PACKET path', () => {
  it('turns a packet scanCode into the Bengali character', () => {
    // 'আ' is U+0986, delivered by Avro as a KEYEVENTF_UNICODE packet.
    expect(decideWin32Key(input({ vkCode: VK.PACKET, scanCode: 0x0986 }))).toEqual([
      { type: 'char', char: 'আ' },
    ]);
    // Combining vowel sign 'ি' U+09BF arrives as its own packet.
    expect(decideWin32Key(input({ vkCode: VK.PACKET, scanCode: 0x09bf }))).toEqual([
      { type: 'char', char: 'ি' },
    ]);
  });

  it('a packet space is a delimiter, packet punctuation too', () => {
    expect(decideWin32Key(input({ vkCode: VK.PACKET, scanCode: 0x20 }))).toEqual([
      { type: 'delimiter', char: ' ' },
    ]);
    expect(decideWin32Key(input({ vkCode: VK.PACKET, scanCode: 0x2e }))).toEqual([
      { type: 'delimiter', char: '.' },
    ]);
  });
});

describe('decideWin32Key — layout (ToUnicodeEx) path', () => {
  it('uses the resolved layout character, Bengali included', () => {
    expect(decideWin32Key(input({ vkCode: 0x4b, resolved: 'ক' }))).toEqual([
      { type: 'char', char: 'ক' },
    ]);
    expect(decideWin32Key(input({ vkCode: 0x41, resolved: 'a' }))).toEqual([
      { type: 'char', char: 'a' },
    ]);
  });

  it('shortcuts win over resolved control characters (Ctrl+C)', () => {
    expect(decideWin32Key(input({ vkCode: 0x43, resolved: '\x03', ctrl: true }))).toEqual([
      { type: 'modifier' },
    ]);
    expect(decideWin32Key(input({ vkCode: 0x43, ctrl: true }))).toEqual([{ type: 'modifier' }]);
  });

  it('AltGr (Ctrl+Alt) with a resolved character is text, not a shortcut', () => {
    expect(
      decideWin32Key(input({ vkCode: 0x45, resolved: '€', ctrl: true, alt: true })),
    ).toEqual([{ type: 'char', char: '€' }]);
    expect(decideWin32Key(input({ vkCode: 0x45, ctrl: true, alt: true }))).toEqual([
      { type: 'modifier' },
    ]);
  });

  it('navigation and function keys reset; Escape dismisses a paste offer (M5.15); shift/caps are ignored', () => {
    expect(decideWin32Key(input({ vkCode: 0x25 }))).toEqual([{ type: 'reset' }]); // Left
    expect(decideWin32Key(input({ vkCode: 0x1b }))).toEqual([
      { type: 'hotkey', hotkey: 'dismiss-paste' },
    ]); // Esc
    expect(decideWin32Key(input({ vkCode: 0x1b, ctrl: true }))).toEqual([{ type: 'reset' }]); // Ctrl+Esc
    expect(decideWin32Key(input({ vkCode: 0x74 }))).toEqual([{ type: 'reset' }]); // F5
    expect(decideWin32Key(input({ vkCode: 0x10 }))).toEqual([]); // Shift
    expect(decideWin32Key(input({ vkCode: 0x14 }))).toEqual([]); // CapsLock
    expect(decideWin32Key(input({ vkCode: 0x5b }))).toEqual([{ type: 'modifier' }]); // Win
  });

  it('editing keys: backspace, tab, enter, space — and their shortcut forms', () => {
    expect(decideWin32Key(input({ vkCode: 0x08 }))).toEqual([{ type: 'backspace' }]);
    expect(decideWin32Key(input({ vkCode: 0x09 }))).toEqual([{ type: 'delimiter', char: '\t' }]);
    expect(decideWin32Key(input({ vkCode: 0x0d }))).toEqual([{ type: 'delimiter', char: '\n' }]);
    expect(decideWin32Key(input({ vkCode: 0x20, shift: true }))).toEqual([
      { type: 'delimiter', char: ' ' },
    ]);
    expect(decideWin32Key(input({ vkCode: 0x09, alt: true }))).toEqual([{ type: 'modifier' }]); // Alt+Tab
    expect(decideWin32Key(input({ vkCode: 0x08, ctrl: true }))).toEqual([{ type: 'modifier' }]); // Ctrl+Backspace
  });

  it('falls back to the US VK table when the layout resolves nothing', () => {
    expect(decideWin32Key(input({ vkCode: 0x41, shift: true }))).toEqual([
      { type: 'char', char: 'A' },
    ]);
    expect(decideWin32Key(input({ vkCode: 0xba, shift: true }))).toEqual([
      { type: 'delimiter', char: ':' },
    ]);
    expect(decideWin32Key(input({ vkCode: 0xff }))).toEqual([]);
  });
});

describe('vkFallbackText', () => {
  it('covers letters, digits and numpad', () => {
    expect(vkFallbackText(0x5a, false)).toBe('z');
    expect(vkFallbackText(0x32, true)).toBe('@');
    expect(vkFallbackText(0x65, false)).toBe('5');
    expect(vkFallbackText(0x01, false)).toBeNull();
  });
});
