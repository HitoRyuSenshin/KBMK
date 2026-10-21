/**
 * Pure planning of synthetic keystrokes for SendInput, plus the
 * byte-level INPUT buffer builder. Pure so the exact key sequences and
 * buffer layout are unit-testable without Windows.
 *
 * One INPUT record on 64-bit Windows is 40 bytes:
 *   offset 0  type (uint32) = 1 (INPUT_KEYBOARD)
 *   offset 8  wVk (uint16), offset 10 wScan (uint16)
 *   offset 12 dwFlags (uint32), offset 16 time (uint32)
 *   offset 24 dwExtraInfo (uint64) — carries KBMK's INJECT_MAGIC so the
 *   keyboard hook can recognise and ignore our own keys.
 */

export interface KeyStroke {
  vk: number;
  scan: number;
  flags: number;
}

export const KEYEVENTF_KEYUP = 0x0002;
export const KEYEVENTF_UNICODE = 0x0004;

export const VK_CODE = {
  BACK: 0x08,
  TAB: 0x09,
  RETURN: 0x0d,
  CONTROL: 0x11,
  SPACE: 0x20,
  V: 0x56,
} as const;

const down = (vk: number): KeyStroke => ({ vk, scan: 0, flags: 0 });
const up = (vk: number): KeyStroke => ({ vk, scan: 0, flags: KEYEVENTF_KEYUP });
const press = (vk: number): KeyStroke[] => [down(vk), up(vk)];

/** A single character delivered as a Unicode packet (like Avro does). */
export function unicodePress(ch: string): KeyStroke[] {
  const code = ch.charCodeAt(0);
  return [
    { vk: 0, scan: code, flags: KEYEVENTF_UNICODE },
    { vk: 0, scan: code, flags: KEYEVENTF_UNICODE | KEYEVENTF_KEYUP },
  ];
}

export function planBackspaces(count: number): KeyStroke[] {
  const strokes: KeyStroke[] = [];
  for (let i = 0; i < count; i++) strokes.push(...press(VK_CODE.BACK));
  return strokes;
}

/** Ctrl+V — paste from the clipboard. */
export function planPasteShortcut(): KeyStroke[] {
  return [down(VK_CODE.CONTROL), down(VK_CODE.V), up(VK_CODE.V), up(VK_CODE.CONTROL)];
}

/**
 * Re-emit the delimiter the user typed. Whitespace delimiters go as
 * real virtual keys so apps treat them exactly like the original
 * keystroke (Enter submits, Tab moves focus); punctuation goes as a
 * Unicode packet, which every text field accepts as the character.
 */
export function planDelimiter(delimiter: string): KeyStroke[] {
  switch (delimiter) {
    case ' ':
      return press(VK_CODE.SPACE);
    case '\n':
      return press(VK_CODE.RETURN);
    case '\t':
      return press(VK_CODE.TAB);
    default: {
      const strokes: KeyStroke[] = [];
      for (const ch of delimiter) strokes.push(...unicodePress(ch));
      return strokes;
    }
  }
}

export const INPUT_RECORD_SIZE = 40; // 64-bit INPUT

export function buildInputBuffer(strokes: KeyStroke[], extraInfo: number): Buffer {
  const buffer = Buffer.alloc(INPUT_RECORD_SIZE * strokes.length);
  strokes.forEach((stroke, i) => {
    const o = i * INPUT_RECORD_SIZE;
    buffer.writeUInt32LE(1, o); // INPUT_KEYBOARD
    buffer.writeUInt16LE(stroke.vk, o + 8);
    buffer.writeUInt16LE(stroke.scan, o + 10);
    buffer.writeUInt32LE(stroke.flags, o + 12);
    buffer.writeUInt32LE(0, o + 16); // time: let the system stamp it
    buffer.writeBigUInt64LE(BigInt(extraInfo), o + 24);
  });
  return buffer;
}
