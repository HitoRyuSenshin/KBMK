import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BLOCK_LIST,
  isAppBlocked,
  normalizeAppName,
  normalizeBlockList,
  processNameFromPath,
} from '../src/settings/blockList';
import { PreferencesStore } from '../src/settings/PreferencesStore';
import { MemoryKeyValueStore } from '../src/profiles/KeyValueStore';
import { decideWin32Key } from '../src/hook/vkChar';
import { mapUiohookKey } from '../src/hook/keymap';

describe('block list logic', () => {
  it('normalizes names: trims, lower-cases, adds .exe when missing', () => {
    expect(normalizeAppName('  Notepad ')).toBe('notepad.exe');
    expect(normalizeAppName('Code.EXE')).toBe('code.exe');
    expect(normalizeAppName('my.app')).toBe('my.app');
    expect(normalizeAppName('   ')).toBe('');
  });

  it('understands a space typed instead of the dot, and repairs the old bad form', () => {
    expect(normalizeAppName('notepad exe')).toBe('notepad.exe');
    expect(normalizeAppName('notepad exe.exe')).toBe('notepad.exe');
    expect(normalizeAppName('notepad . exe')).toBe('notepad.exe');
    expect(normalizeAppName('my app')).toBe('my app.exe');
    expect(normalizeAppName('my app exe')).toBe('my app.exe');
  });

  it('normalizes a whole list: dedupes and sorts', () => {
    expect(normalizeBlockList(['Notepad', 'notepad.exe', ' code ', ''])).toEqual([
      'code.exe',
      'notepad.exe',
    ]);
  });

  it('extracts the process name from a Windows path', () => {
    expect(processNameFromPath('C:\\Windows\\System32\\NOTEPAD.EXE')).toBe('notepad.exe');
    expect(processNameFromPath('C:/Program Files/KeePassXC/KeePassXC.exe')).toBe('keepassxc.exe');
  });

  it('matching is case-insensitive and null-safe', () => {
    expect(isAppBlocked(['notepad.exe'], 'notepad.exe')).toBe(true);
    expect(isAppBlocked(['notepad.exe'], 'Notepad.exe')).toBe(true);
    expect(isAppBlocked(['notepad.exe'], 'code.exe')).toBe(false);
    expect(isAppBlocked(['notepad.exe'], null)).toBe(false);
  });
});

describe('PreferencesStore', () => {
  it('defaults to the password-manager list when never set; an emptied list stays empty', () => {
    const store = new PreferencesStore(new MemoryKeyValueStore());
    expect(store.blockList()).toEqual(DEFAULT_BLOCK_LIST);
    expect(store.blockList()).toContain('keepassxc.exe');
    store.setBlockList([]);
    expect(store.blockList()).toEqual([]);
    store.setBlockList(['Notepad']);
    expect(store.blockList()).toEqual(['notepad.exe']);
  });

  it('persists across instances over the same kv store', () => {
    const kv = new MemoryKeyValueStore();
    new PreferencesStore(kv).setBlockList(['code.exe']);
    expect(new PreferencesStore(kv).blockList()).toEqual(['code.exe']);
  });
});

describe('Ctrl+Alt+T pause/resume hotkey (M5)', () => {
  const base = { scanCode: 0, resolved: null as string | null, shift: false, ctrl: false, alt: false, meta: false };

  it('Win32 path: Ctrl+Alt+T (vk 0x54) is the toggle hotkey', () => {
    expect(decideWin32Key({ ...base, vkCode: 0x54, ctrl: true, alt: true })).toEqual([
      { type: 'hotkey', hotkey: 'toggle' },
    ]);
    expect(decideWin32Key({ ...base, vkCode: 0x54, ctrl: true })).toEqual([{ type: 'modifier' }]);
  });

  it('Win32 path: AltGr+T resolving to a real character still types it', () => {
    expect(decideWin32Key({ ...base, vkCode: 0x54, ctrl: true, alt: true, resolved: 'ţ' })).toEqual([
      { type: 'char', char: 'ţ' },
    ]);
  });

  it('uiohook path: Ctrl+Alt+T (keycode 20) is the toggle hotkey', () => {
    expect(
      mapUiohookKey({ keycode: 20, shiftKey: false, ctrlKey: true, altKey: true, metaKey: false }),
    ).toEqual({ type: 'hotkey', hotkey: 'toggle' });
    expect(
      mapUiohookKey({ keycode: 20, shiftKey: false, ctrlKey: false, altKey: true, metaKey: false }),
    ).toEqual({ type: 'modifier' });
  });
});
