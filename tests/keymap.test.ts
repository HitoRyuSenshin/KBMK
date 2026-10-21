import { describe, expect, it } from 'vitest';
import { formatRawKey, mapUiohookKey, type RawKey } from '../src/hook/keymap';

const key = (keycode: number, mods: Partial<RawKey> = {}): RawKey => ({
  keycode,
  shiftKey: false,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  ...mods,
});

describe('mapUiohookKey (uiohook-napi 1.5.5 keycodes)', () => {
  it('maps letters, shift-aware', () => {
    expect(mapUiohookKey(key(35))).toEqual({ type: 'char', char: 'h' }); // H
    expect(mapUiohookKey(key(35, { shiftKey: true }))).toEqual({ type: 'char', char: 'H' });
    expect(mapUiohookKey(key(30))).toEqual({ type: 'char', char: 'a' }); // A
  });

  it('maps the spec delimiters', () => {
    expect(mapUiohookKey(key(57))).toEqual({ type: 'delimiter', char: ' ' }); // Space
    expect(mapUiohookKey(key(28))).toEqual({ type: 'delimiter', char: '\n' }); // Enter
    expect(mapUiohookKey(key(15))).toEqual({ type: 'delimiter', char: '\t' }); // Tab
    expect(mapUiohookKey(key(51))).toEqual({ type: 'delimiter', char: ',' }); // Comma
    expect(mapUiohookKey(key(52))).toEqual({ type: 'delimiter', char: '.' }); // Period
    expect(mapUiohookKey(key(39))).toEqual({ type: 'delimiter', char: ';' }); // Semicolon
    expect(mapUiohookKey(key(39, { shiftKey: true }))).toEqual({ type: 'delimiter', char: ':' });
    expect(mapUiohookKey(key(53, { shiftKey: true }))).toEqual({ type: 'delimiter', char: '?' });
    expect(mapUiohookKey(key(2, { shiftKey: true }))).toEqual({ type: 'delimiter', char: '!' }); // shift+1
  });

  it('maps backspace, digits and URL/email symbols as chars', () => {
    expect(mapUiohookKey(key(14))).toEqual({ type: 'backspace' });
    expect(mapUiohookKey(key(2))).toEqual({ type: 'char', char: '1' });
    expect(mapUiohookKey(key(3, { shiftKey: true }))).toEqual({ type: 'char', char: '@' });
    expect(mapUiohookKey(key(53))).toEqual({ type: 'char', char: '/' });
  });

  it('any Ctrl/Alt/Win combo is a modifier event, never text', () => {
    expect(mapUiohookKey(key(46, { ctrlKey: true }))).toEqual({ type: 'modifier' }); // Ctrl+C
    expect(mapUiohookKey(key(20, { altKey: true }))).toEqual({ type: 'modifier' });
    expect(mapUiohookKey(key(19, { metaKey: true }))).toEqual({ type: 'modifier' });
    expect(mapUiohookKey(key(29))).toEqual({ type: 'modifier' }); // Ctrl itself
  });

  it('arrows and Home/End reset; Shift and CapsLock are ignored; Escape dismisses a paste offer (M5.15)', () => {
    expect(mapUiohookKey(key(57419))).toEqual({ type: 'reset' }); // ArrowLeft
    expect(mapUiohookKey(key(57424))).toEqual({ type: 'reset' }); // ArrowDown
    expect(mapUiohookKey(key(3655))).toEqual({ type: 'reset' }); // Home
    expect(mapUiohookKey(key(3663))).toEqual({ type: 'reset' }); // End
    expect(mapUiohookKey(key(1))).toEqual({ type: 'hotkey', hotkey: 'dismiss-paste' }); // Escape
    expect(mapUiohookKey(key(42))).toBeNull(); // Shift
    expect(mapUiohookKey(key(58))).toBeNull(); // CapsLock
  });

  it('unmapped keys are ignored, not treated as text', () => {
    expect(mapUiohookKey(key(9999))).toBeNull();
    expect(mapUiohookKey(key(0))).toBeNull(); // VC_UNDEFINED — what IME-consumed keys surface as
  });

  it('formatRawKey renders the diagnostics line', () => {
    expect(formatRawKey(key(0))).toBe(
      'keycode=0 shift=false ctrl=false alt=false meta=false',
    );
    expect(formatRawKey(key(57, { shiftKey: true }))).toContain('keycode=57 shift=true');
  });
});
