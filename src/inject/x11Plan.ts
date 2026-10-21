/**
 * Pure planning of synthetic key actions for the X11 injector
 * (LinuxTextInjector), mirroring keyPlan.ts for Windows. An action is
 * one key press or release identified by its X keysym; the injector
 * resolves keysyms to keycodes via XKeysymToKeycode and fires them
 * with XTestFakeKeyEvent. Pure so the sequences are unit-testable
 * without an X server.
 */

export const X11_KEYSYM = {
  BACKSPACE: 0xff08,
  TAB: 0xff09,
  RETURN: 0xff0d,
  SPACE: 0x20,
  CONTROL_L: 0xffe3,
  V: 0x76,
} as const;

export interface X11KeyAction {
  keysym: number;
  /** true = key press, false = release. */
  press: boolean;
}

const down = (keysym: number): X11KeyAction => ({ keysym, press: true });
const up = (keysym: number): X11KeyAction => ({ keysym, press: false });
const tap = (keysym: number): X11KeyAction[] => [down(keysym), up(keysym)];

export function planX11Backspaces(count: number): X11KeyAction[] {
  const actions: X11KeyAction[] = [];
  for (let i = 0; i < count; i++) actions.push(...tap(X11_KEYSYM.BACKSPACE));
  return actions;
}

/** Ctrl+V — paste from the clipboard. */
export function planX11PasteShortcut(): X11KeyAction[] {
  return [
    down(X11_KEYSYM.CONTROL_L),
    down(X11_KEYSYM.V),
    up(X11_KEYSYM.V),
    up(X11_KEYSYM.CONTROL_L),
  ];
}

/**
 * How to re-emit the delimiter the user typed. Whitespace delimiters
 * go as real keys so apps treat them exactly like the original
 * keystroke (Enter submits, Tab moves focus). Anything else (,.!?;:,
 * the Bengali dandas, …) cannot be typed reliably through XTest —
 * arbitrary Unicode keysyms have no keycode on most layouts — so it is
 * delivered as a tiny clipboard paste instead, the same mechanism the
 * replacement itself uses.
 */
export type X11DelimiterPlan =
  | { kind: 'keys'; actions: X11KeyAction[] }
  | { kind: 'paste'; text: string };

export function planX11Delimiter(delimiter: string): X11DelimiterPlan {
  switch (delimiter) {
    case ' ':
      return { kind: 'keys', actions: tap(X11_KEYSYM.SPACE) };
    case '\n':
      return { kind: 'keys', actions: tap(X11_KEYSYM.RETURN) };
    case '\t':
      return { kind: 'keys', actions: tap(X11_KEYSYM.TAB) };
    default:
      return { kind: 'paste', text: delimiter };
  }
}
