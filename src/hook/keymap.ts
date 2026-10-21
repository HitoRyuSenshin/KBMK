import type { KeyEventLike } from './KeyHook';

/**
 * Pure mapping from uiohook-napi keycodes (libuiohook codes, verified
 * against uiohook-napi@1.5.5's bundled types) to normalized key events.
 *
 * uiohook gives keycodes, not characters, so characters come from this
 * US-layout table, shift-aware. That is an honest limitation: with a
 * non-US physical layout, the *positions* still map to US characters.
 * Text the OS produces for non-Latin layouts cannot be recovered from
 * keycodes alone — the WordBuffer itself is fully Unicode-ready and is
 * unit-tested with Bengali and Arabic words fed in as characters.
 */

export interface RawKey {
  keycode: number;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

const LETTERS: Record<number, string> = {
  16: 'q', 17: 'w', 18: 'e', 19: 'r', 20: 't', 21: 'y', 22: 'u', 23: 'i',
  24: 'o', 25: 'p', 30: 'a', 31: 's', 32: 'd', 33: 'f', 34: 'g', 35: 'h',
  36: 'j', 37: 'k', 38: 'l', 44: 'z', 45: 'x', 46: 'c', 47: 'v', 48: 'b',
  49: 'n', 50: 'm',
};

/** keycode -> [unshifted, shifted] for the digit row. */
const DIGIT_ROW: Record<number, [string, string]> = {
  2: ['1', '!'], 3: ['2', '@'], 4: ['3', '#'], 5: ['4', '$'], 6: ['5', '%'],
  7: ['6', '^'], 8: ['7', '&'], 9: ['8', '*'], 10: ['9', '('], 11: ['0', ')'],
};

/** keycode -> [unshifted, shifted] for other printable punctuation. */
const PUNCT: Record<number, [string, string]> = {
  12: ['-', '_'], 13: ['=', '+'], 26: ['[', '{'], 27: [']', '}'],
  40: ["'", '"'], 41: ['`', '~'], 43: ['\\', '|'],
};

/** Numpad digits (NumLock on). keycode -> digit. */
const NUMPAD_DIGITS: Record<number, string> = {
  82: '0', 79: '1', 80: '2', 81: '3', 75: '4', 76: '5', 77: '6',
  71: '7', 72: '8', 73: '9',
};

/** Keys that abandon the current word (spec reset list + navigation/function keys).
 *  Escape (1) is handled separately: it dismisses a paste offer (M5.15). */
const RESET_KEYCODES = new Set<number>([
  3657, 3665, // PageUp, PageDown
  3663, 3655, // End, Home
  57419, 57416, 57421, 57424, // ArrowLeft/Up/Right/Down
  3666, 3667, // Insert, Delete
]);
const F_KEYCODES = new Set<number>([
  59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 87, 88, // F1-F12
]);
const MODIFIER_KEYCODES = new Set<number>([
  29, 3613, // Ctrl, CtrlRight
  56, 3640, // Alt, AltRight
  3675, 3676, // Meta (Win), MetaRight
]);
const IGNORED_KEYCODES = new Set<number>([
  42, 54, // Shift, ShiftRight — handled via the shiftKey flag on other keys
  58, // CapsLock
  69, 70, // NumLock, ScrollLock
  3639, // PrintScreen
]);

const char = (c: string): KeyEventLike => ({ type: 'char', char: c });
const delimiter = (c: string): KeyEventLike => ({ type: 'delimiter', char: c });

/** One-line raw keycode dump, used only by the opt-in KBMK_DEBUG_KEYS diagnostics. */
export function formatRawKey(raw: RawKey): string {
  return (
    `keycode=${raw.keycode} shift=${raw.shiftKey} ctrl=${raw.ctrlKey} ` +
    `alt=${raw.altKey} meta=${raw.metaKey}`
  );
}

export function mapUiohookKey(raw: RawKey): KeyEventLike | null {
  const { keycode, shiftKey } = raw;

  // Ctrl+Alt+Z / Ctrl+Alt+T are KBMK's hotkeys (undo / pause-resume).
  if (raw.ctrlKey && raw.altKey && keycode === 44) {
    return { type: 'hotkey', hotkey: 'undo' };
  }
  if (raw.ctrlKey && raw.altKey && keycode === 20) {
    return { type: 'hotkey', hotkey: 'toggle' };
  }
  // Ctrl+V pastes (M5.14).
  if (raw.ctrlKey && !raw.altKey && !raw.metaKey && keycode === 47) {
    return { type: 'paste' };
  }

  // Any Ctrl/Alt/Win combo is a shortcut, never text (spec).
  if (raw.ctrlKey || raw.altKey || raw.metaKey || MODIFIER_KEYCODES.has(keycode)) {
    return { type: 'modifier' };
  }
  if (IGNORED_KEYCODES.has(keycode)) return null;
  // Plain Esc dismisses a pending paste offer (M5.15).
  if (keycode === 1) {
    return { type: 'hotkey', hotkey: 'dismiss-paste' };
  }
  // Shift+Insert is the other paste combo (M5.14) — Insert alone is a reset.
  if (keycode === 3666 && shiftKey) {
    return { type: 'paste' };
  }
  if (RESET_KEYCODES.has(keycode) || F_KEYCODES.has(keycode)) {
    return { type: 'reset' };
  }

  switch (keycode) {
    case 14:
      return { type: 'backspace' };
    case 57:
      return delimiter(' ');
    case 28:
      return delimiter('\n');
    case 15:
      return delimiter('\t');
    case 39: // Semicolon / Colon — both are spec delimiters
      return delimiter(shiftKey ? ':' : ';');
    case 51: // Comma / <
      return shiftKey ? char('<') : delimiter(',');
    case 52: // Period / >
      return shiftKey ? char('>') : delimiter('.');
    case 53: // Slash / Question — '?' is a spec delimiter, '/' is a char (taints URLs)
      return shiftKey ? delimiter('?') : char('/');
    case 83: // NumpadDecimal
      return delimiter('.');
    case 55:
      return char('*');
    case 78:
      return char('+');
    case 74:
      return char('-');
    case 3637: // NumpadDivide
      return char('/');
    default:
      break;
  }

  const letter = LETTERS[keycode];
  if (letter) return char(shiftKey ? letter.toUpperCase() : letter);

  const digitRow = DIGIT_ROW[keycode];
  if (digitRow) {
    const picked = shiftKey ? digitRow[1] : digitRow[0];
    // '!' (shift+1) is a spec delimiter; every other shifted digit-row
    // symbol is a plain char that the WordBuffer classifies.
    return picked === '!' ? delimiter('!') : char(picked);
  }

  const punct = PUNCT[keycode];
  if (punct) return char(shiftKey ? punct[1] : punct[0]);

  const numpad = NUMPAD_DIGITS[keycode];
  if (numpad) return char(numpad);

  // Unmapped key: ignore it rather than disturb the buffer.
  return null;
}
