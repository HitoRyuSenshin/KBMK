import { describe, expect, it } from 'vitest';
import { countDeletionUnits } from '../src/shared/text';
import {
  INPUT_RECORD_SIZE,
  KEYEVENTF_KEYUP,
  KEYEVENTF_UNICODE,
  VK_CODE,
  buildInputBuffer,
  planBackspaces,
  planDelimiter,
  planPasteShortcut,
} from '../src/inject/keyPlan';
import { INJECT_MAGIC } from '../src/shared/injectMagic';

describe('countDeletionUnits', () => {
  it('counts Latin words like string length', () => {
    expect(countDeletionUnits('hello')).toBe(5);
    expect(countDeletionUnits("don't")).toBe(5);
    expect(countDeletionUnits('')).toBe(0);
  });

  it('counts every Bengali code unit, combining vowel signs included', () => {
    // Regression (M4.1): grapheme counting under-deleted and left the
    // first letters behind — নাম (2 graphemes) left "ন", শিহাব left "শি".
    // One Backspace in Notepad deletes one UTF-16 code unit.
    expect(countDeletionUnits('আমি')).toBe(3);
    expect(countDeletionUnits('নাম')).toBe(3);
    expect(countDeletionUnits('শিহাব')).toBe(5);
  });

  it('counts a combining accent as its own unit, like Backspace does', () => {
    expect(countDeletionUnits('é')).toBe(1); // precomposed
    expect(countDeletionUnits('é')).toBe(2); // e + combining acute
  });
});

describe('keyPlan', () => {
  it('backspaces are alternating down/up pairs of VK_BACK', () => {
    const plan = planBackspaces(3);
    expect(plan).toHaveLength(6);
    expect(plan[0]).toEqual({ vk: VK_CODE.BACK, scan: 0, flags: 0 });
    expect(plan[1]).toEqual({ vk: VK_CODE.BACK, scan: 0, flags: KEYEVENTF_KEYUP });
    expect(plan[4].vk).toBe(VK_CODE.BACK);
  });

  it('paste is Ctrl down, V down, V up, Ctrl up', () => {
    const plan = planPasteShortcut();
    expect(plan.map((s) => [s.vk, s.flags])).toEqual([
      [VK_CODE.CONTROL, 0],
      [VK_CODE.V, 0],
      [VK_CODE.V, KEYEVENTF_KEYUP],
      [VK_CODE.CONTROL, KEYEVENTF_KEYUP],
    ]);
  });

  it('whitespace delimiters go as real virtual keys; punctuation as Unicode', () => {
    expect(planDelimiter(' ')).toEqual([
      { vk: VK_CODE.SPACE, scan: 0, flags: 0 },
      { vk: VK_CODE.SPACE, scan: 0, flags: KEYEVENTF_KEYUP },
    ]);
    expect(planDelimiter('\n')[0].vk).toBe(VK_CODE.RETURN);
    expect(planDelimiter('\t')[0].vk).toBe(VK_CODE.TAB);
    const comma = planDelimiter(',');
    expect(comma[0]).toEqual({ vk: 0, scan: ','.charCodeAt(0), flags: KEYEVENTF_UNICODE });
    expect(comma[1].flags).toBe(KEYEVENTF_UNICODE | KEYEVENTF_KEYUP);
  });

  it('buildInputBuffer writes 40-byte INPUT records with the magic at offset 24', () => {
    const buffer = buildInputBuffer(planBackspaces(2), INJECT_MAGIC);
    expect(buffer.length).toBe(4 * INPUT_RECORD_SIZE);
    expect(buffer.readUInt32LE(0)).toBe(1); // INPUT_KEYBOARD
    expect(buffer.readUInt16LE(8)).toBe(VK_CODE.BACK);
    expect(buffer.readUInt32LE(12)).toBe(0); // keydown flags
    expect(Number(buffer.readBigUInt64LE(24))).toBe(INJECT_MAGIC);
    // Second record (key up) starts at offset 40.
    expect(buffer.readUInt32LE(INPUT_RECORD_SIZE + 12)).toBe(KEYEVENTF_KEYUP);
  });
});
