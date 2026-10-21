import type { KeyEventLike } from './KeyHook';

/**
 * Pure decision logic for the Windows (Win32) key capture path.
 *
 * Why this exists: uiohook-napi exposes only a layout keycode, so text
 * produced by an input method never appears. On Windows the real data is
 * in the low-level hook struct (KBDLLHOOKSTRUCT):
 * - Avro Keyboard (and anything injecting text with KEYEVENTF_UNICODE)
 *   arrives as vkCode === VK_PACKET with the Unicode code unit in
 *   scanCode. This is how the finished Bengali text actually reaches apps.
 * - Ordinary layouts are resolved with ToUnicodeEx against the
 *   foreground window's keyboard layout, which yields the real character
 *   for that layout (Latin, Bengali InScript, …).
 *
 * This file only decides; all FFI lives in Win32LayoutKeyHook so the
 * decisions are unit-testable with fake inputs.
 */

export const VK = {
  BACKSPACE: 0x08,
  TAB: 0x09,
  ENTER: 0x0d,
  SHIFT: 0x10,
  CTRL: 0x11,
  ALT: 0x12,
  CAPS_LOCK: 0x14,
  ESCAPE: 0x1b,
  SPACE: 0x20,
  PACKET: 0xe7, // VK_PACKET — KEYEVENTF_UNICODE injected text (Avro)
} as const;

const TEXT_DELIMITERS = new Set([',', '.', '!', '?', ';', ':', '।', '॥']);

/**
 * Turn resolved text into key events: spec delimiters become delimiter
 * events, control characters become their editing events, everything
 * else is a word character. The delimiter set includes the Bengali /
 * Indic sentence terminators । (danda, U+0964) and ॥ (double danda,
 * U+0965) — in Bengali prose । ends a sentence the way "." does in
 * English, and a word before it must complete and translate (M4.2).
 */
export function classifyText(text: string): KeyEventLike[] {
  const events: KeyEventLike[] = [];
  for (const ch of text) {
    if (ch === ' ') events.push({ type: 'delimiter', char: ' ' });
    else if (ch === '\r' || ch === '\n') events.push({ type: 'delimiter', char: '\n' });
    else if (ch === '\t') events.push({ type: 'delimiter', char: '\t' });
    else if (ch === '\b') events.push({ type: 'backspace' });
    else if (ch === '\x1b') events.push({ type: 'reset' });
    else if (ch < ' ' || ch === '\x7f') {
      // Other control characters carry no text; ignore them.
    } else if (TEXT_DELIMITERS.has(ch)) events.push({ type: 'delimiter', char: ch });
    else events.push({ type: 'char', char: ch });
  }
  return events;
}

const OEM_SHIFTED: Record<number, [string, string]> = {
  0xba: [';', ':'],
  0xbb: ['=', '+'],
  0xbc: [',', '<'],
  0xbd: ['-', '_'],
  0xbe: ['.', '>'],
  0xbf: ['/', '?'],
  0xc0: ['`', '~'],
  0xdb: ['[', '{'],
  0xdc: ['\\', '|'],
  0xdd: [']', '}'],
  0xde: ["'", '"'],
};
const DIGIT_SHIFTED = ')!@#$%^&*(';

/** US-layout fallback string for a VK, used only when ToUnicodeEx yields nothing. */
export function vkFallbackText(vkCode: number, shift: boolean): string | null {
  if (vkCode >= 0x41 && vkCode <= 0x5a) {
    const letter = String.fromCharCode(vkCode + 32);
    return shift ? letter.toUpperCase() : letter;
  }
  if (vkCode >= 0x30 && vkCode <= 0x39) {
    const digit = vkCode - 0x30;
    return shift ? DIGIT_SHIFTED[digit] : String(digit);
  }
  if (vkCode >= 0x60 && vkCode <= 0x69) return String(vkCode - 0x60); // numpad digits
  if (vkCode === 0x6e) return '.';
  if (vkCode === 0x6a) return '*';
  if (vkCode === 0x6b) return '+';
  if (vkCode === 0x6d) return '-';
  if (vkCode === 0x6f) return '/';
  const oem = OEM_SHIFTED[vkCode];
  if (oem) return shift ? oem[1] : oem[0];
  return null;
}

const RESET_VKS = new Set<number>([
  0x21, 0x22, 0x23, 0x24, // PageUp, PageDown, End, Home
  0x25, 0x26, 0x27, 0x28, // ArrowLeft/Up/Right/Down
  0x2d, 0x2e, // Insert, Delete
]);
const IGNORED_VKS = new Set<number>([
  VK.SHIFT, 0xa0, 0xa1, // Shift keys — state arrives via flags on other keys
  VK.CAPS_LOCK, 0x90, 0x91, // CapsLock, NumLock, ScrollLock
  0x2c, // PrintScreen
]);

export interface Win32KeyInput {
  vkCode: number;
  scanCode: number;
  /** Text from ToUnicodeEx for the foreground layout, or null if none/dead key. */
  resolved: string | null;
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
  meta: boolean;
}

export function decideWin32Key(input: Win32KeyInput): KeyEventLike[] {
  const { vkCode, scanCode, resolved, shift, ctrl, alt, meta } = input;
  const anyMod = ctrl || alt || meta;

  // Injected Unicode text (Avro output, KEYEVENTF_UNICODE): the finished
  // character itself, layout-independent.
  if (vkCode === VK.PACKET) {
    return classifyText(String.fromCharCode(scanCode & 0xffff));
  }

  if (IGNORED_VKS.has(vkCode)) return [];
  if (vkCode === VK.CTRL || vkCode === 0xa2 || vkCode === 0xa3) return [{ type: 'modifier' }];
  if (vkCode === VK.ALT || vkCode === 0xa4 || vkCode === 0xa5) return [{ type: 'modifier' }];
  if (vkCode === 0x5b || vkCode === 0x5c) return [{ type: 'modifier' }]; // Win keys

  if (vkCode === VK.ESCAPE) {
    // Plain Esc dismisses a pending paste offer (M5.15; it replaced
    // Alt+Space, which is a Windows system key). Modified Esc
    // (Ctrl+Esc = Start menu, …) keeps the plain reset behaviour.
    return ctrl || alt || meta
      ? [{ type: 'reset' }]
      : [{ type: 'hotkey', hotkey: 'dismiss-paste' }];
  }
  // Shift+Insert is the other paste combo (M5.14) — Insert alone is a reset.
  if (vkCode === 0x2d && shift && !ctrl && !alt && !meta) return [{ type: 'paste' }];
  if (RESET_VKS.has(vkCode)) return [{ type: 'reset' }];
  if (vkCode >= 0x70 && vkCode <= 0x87) return [{ type: 'reset' }]; // F1–F24

  // Editing/whitespace keys, including their shortcut forms.
  if (vkCode === VK.BACKSPACE) return anyMod ? [{ type: 'modifier' }] : [{ type: 'backspace' }];
  if (vkCode === VK.TAB) return anyMod ? [{ type: 'modifier' }] : [{ type: 'delimiter', char: '\t' }];
  if (vkCode === VK.ENTER) return anyMod ? [{ type: 'modifier' }] : [{ type: 'delimiter', char: '\n' }];
  if (vkCode === VK.SPACE) return anyMod ? [{ type: 'modifier' }] : [{ type: 'delimiter', char: ' ' }];

  if (meta) return [{ type: 'modifier' }];
  if (ctrl || alt) {
    // AltGr is Ctrl+Alt on many layouts and produces real characters;
    // if the layout resolved one, it is text, not a shortcut.
    if (ctrl && alt && resolved && resolved.length > 0) return classifyText(resolved);
    // Ctrl+Alt+Z / Ctrl+Alt+T are KBMK's hotkeys (undo / pause-resume).
    // They must come after the AltGr text check so a layout that maps
    // AltGr+Z or AltGr+T to a real character still types that character.
    if (ctrl && alt && vkCode === 0x5a) return [{ type: 'hotkey', hotkey: 'undo' }];
    if (ctrl && alt && vkCode === 0x54) return [{ type: 'hotkey', hotkey: 'toggle' }];
    // Ctrl+V (with or without Shift, as terminals use) pastes (M5.14).
    if (ctrl && !alt && vkCode === 0x56) return [{ type: 'paste' }];
    return [{ type: 'modifier' }];
  }

  if (resolved && resolved.length > 0) return classifyText(resolved);

  const fallback = vkFallbackText(vkCode, shift);
  return fallback ? classifyText(fallback) : [];
}
