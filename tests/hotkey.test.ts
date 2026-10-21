import { describe, expect, it } from 'vitest';
import { decideWin32Key } from '../src/hook/vkChar';
import { mapUiohookKey } from '../src/hook/keymap';
import { WordBuffer } from '../src/hook/WordBuffer';

const base = { scanCode: 0, resolved: null as string | null, shift: false, ctrl: false, alt: false, meta: false };

describe('Ctrl+Alt+Z undo hotkey (M4)', () => {
  it('Win32 path: Ctrl+Alt+Z (vk 0x5A, nothing resolved) is the undo hotkey', () => {
    expect(decideWin32Key({ ...base, vkCode: 0x5a, ctrl: true, alt: true })).toEqual([
      { type: 'hotkey', hotkey: 'undo' },
    ]);
  });

  it('Win32 path: other Ctrl+Alt combos stay plain modifiers', () => {
    expect(decideWin32Key({ ...base, vkCode: 0x43, ctrl: true, alt: true })).toEqual([
      { type: 'modifier' },
    ]);
    expect(decideWin32Key({ ...base, vkCode: 0x5a, ctrl: true })).toEqual([{ type: 'modifier' }]);
  });

  it('Win32 path: AltGr+Z that resolves to a real character still types it', () => {
    expect(
      decideWin32Key({ ...base, vkCode: 0x5a, ctrl: true, alt: true, resolved: 'ź' }),
    ).toEqual([{ type: 'char', char: 'ź' }]);
  });

  it('uiohook path: Ctrl+Alt+Z (keycode 44) is the undo hotkey; Ctrl+Z alone is not', () => {
    expect(
      mapUiohookKey({ keycode: 44, shiftKey: false, ctrlKey: true, altKey: true, metaKey: false }),
    ).toEqual({ type: 'hotkey', hotkey: 'undo' });
    expect(
      mapUiohookKey({ keycode: 44, shiftKey: false, ctrlKey: true, altKey: false, metaKey: false }),
    ).toEqual({ type: 'modifier' });
  });

  it('the word buffer treats a hotkey event as a reset', () => {
    const buffer = new WordBuffer();
    buffer.handle({ type: 'char', char: 'h' });
    buffer.handle({ type: 'char', char: 'i' });
    expect(buffer.handle({ type: 'hotkey', hotkey: 'undo' })).toBeNull();
    expect(buffer.current).toBe('');
  });
});
