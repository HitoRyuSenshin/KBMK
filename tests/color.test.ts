import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ACCENT,
  activeIndicatorColor,
  clampGlassOpacity,
  hexToHsv,
  hsvToHex,
  hsvToRgb,
  normalizeHexColor,
} from '../src/shared/color';
import { PreferencesStore } from '../src/settings/PreferencesStore';
import { MemoryKeyValueStore } from '../src/profiles/KeyValueStore';

describe('normalizeHexColor', () => {
  it('normalizes case, missing #, and 3-digit shorthand', () => {
    expect(normalizeHexColor('#E24B4A')).toBe('#e24b4a');
    expect(normalizeHexColor('e24b4a')).toBe('#e24b4a');
    expect(normalizeHexColor('#abc')).toBe('#aabbcc');
    expect(normalizeHexColor('  #3B82F6 ')).toBe('#3b82f6');
  });

  it('rejects non-colours', () => {
    expect(normalizeHexColor('red')).toBeNull();
    expect(normalizeHexColor('#12345')).toBeNull();
    expect(normalizeHexColor('#gggggg')).toBeNull();
    expect(normalizeHexColor(42)).toBeNull();
    expect(normalizeHexColor(null)).toBeNull();
  });
});

describe('HSV <-> hex (colour wheel math)', () => {
  it('produces the primaries and the default red', () => {
    expect(hsvToHex(0, 1, 1)).toBe('#ff0000');
    expect(hsvToHex(120, 1, 1)).toBe('#00ff00');
    expect(hsvToHex(240, 1, 1)).toBe('#0000ff');
    expect(hsvToHex(0, 0, 1)).toBe('#ffffff');
    expect(hsvToHex(0, 0, 0)).toBe('#000000');
    expect(hsvToRgb(0, 1, 1)).toEqual([255, 0, 0]);
  });

  it('round-trips a picked colour within a step', () => {
    const original = hexToHsv('#3b82f6');
    expect(hsvToHex(original.h, original.s, original.v)).toBe('#3b82f6');
    const red = hexToHsv(DEFAULT_ACCENT);
    expect(hsvToHex(red.h, red.s, red.v)).toBe(DEFAULT_ACCENT);
  });
});

describe('PreferencesStore accent', () => {
  it('defaults to KBMK red, stores normalized picks, ignores a corrupt stored value', () => {
    const kv = new MemoryKeyValueStore();
    const store = new PreferencesStore(kv);
    expect(store.accent()).toBe(DEFAULT_ACCENT);
    expect(store.setAccent('#3B82F6')).toBe('#3b82f6');
    expect(new PreferencesStore(kv).accent()).toBe('#3b82f6');
    expect(() => store.setAccent('not-a-colour')).toThrow();
    kv.set('accentColor.v1', 'garbage');
    expect(store.accent()).toBe(DEFAULT_ACCENT);
  });
});

describe('glass opacity (M5.10)', () => {
  it('clamps to 0.35–1 and defaults junk to fully solid', () => {
    expect(clampGlassOpacity(0.5)).toBe(0.5);
    expect(clampGlassOpacity(0.1)).toBe(0.35);
    expect(clampGlassOpacity(1.4)).toBe(1);
    expect(clampGlassOpacity('see-through')).toBe(1);
    expect(clampGlassOpacity(undefined)).toBe(1);
    expect(clampGlassOpacity(Number.NaN)).toBe(1);
  });

  it('persists through PreferencesStore and self-heals a corrupt value', () => {
    const kv = new MemoryKeyValueStore();
    const store = new PreferencesStore(kv);
    expect(store.glassOpacity()).toBe(1);
    expect(store.setGlassOpacity(0.62)).toBe(0.62);
    expect(new PreferencesStore(kv).glassOpacity()).toBe(0.62);
    kv.set('glassOpacity.v1', 'garbage');
    expect(store.glassOpacity()).toBe(1);
  });
});

describe('active indicator colour (M5.10)', () => {
  it('turns blue when the accent is green or near-green, so the dot cannot blend in', () => {
    expect(activeIndicatorColor('#22a06b')).toBe('#0a84ff'); // green preset
    expect(activeIndicatorColor('#14b8a6')).toBe('#0a84ff'); // teal preset
    expect(activeIndicatorColor('#2ecc71')).toBe('#0a84ff'); // the dot's own green
  });

  it('stays green for every other accent family', () => {
    expect(activeIndicatorColor(DEFAULT_ACCENT)).toBe('#2ecc71'); // KBMK red
    expect(activeIndicatorColor('#3b82f6')).toBe('#2ecc71'); // blue accent
    expect(activeIndicatorColor('#f59e0b')).toBe('#2ecc71'); // amber
    expect(activeIndicatorColor('#8b5cf6')).toBe('#2ecc71'); // purple
    expect(activeIndicatorColor('#9aa0a6')).toBe('#2ecc71'); // grey: no hue to blend with
  });
});
