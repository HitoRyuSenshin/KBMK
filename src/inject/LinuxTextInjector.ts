import { clipboard } from 'electron';
import type { TextInjector } from './TextInjector';
import {
  planX11Backspaces,
  planX11Delimiter,
  planX11PasteShortcut,
  type X11KeyAction,
} from './x11Plan';

/**
 * Linux text injection via XTest (libXtst) driven through koffi — the
 * same FFI library the rest of the app uses, so no new native
 * dependency and no external helper binary (no xdotool). Mirrors
 * WindowsTextInjector's flow exactly: Backspace over the word + its
 * delimiter, paste the translation from the clipboard (the only
 * reliable way to deliver arbitrary Unicode, incl. Bengali), restore
 * the user's clipboard, then re-emit the delimiter. Punctuation
 * delimiters are pasted too — XTest cannot type arbitrary Unicode
 * keysyms on most layouts (see x11Plan).
 *
 * X11 only. On a Wayland session the X display either doesn't exist
 * (available = false) or is XWayland, in which case synthetic keys
 * reach X11/XWayland apps only — the startup log says so. If key
 * capture works on the machine (uiohook also needs libXtst), this
 * injector's libraries are present too.
 *
 * Injection feedback: XTest events are visible to the uiohook capture,
 * but the coordinator holds the hooks' `injecting` guard for the whole
 * edit plus a tail, exactly as on Windows, so our own keys never feed
 * the word buffer.
 */

type XOpenDisplayFn = (name: string | null) => unknown;
type XKeysymToKeycodeFn = (display: unknown, keysym: number) => number;
type XTestFakeKeyEventFn = (
  display: unknown,
  keycode: number,
  /** X11 Bool as a number (1/0) — koffi rejects JS booleans here. */
  isPress: number,
  delay: number,
) => number;
type XFlushFn = (display: unknown) => number;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class LinuxTextInjector implements TextInjector {
  available = false;
  /** Why injection is unavailable (for the startup log); null when available. */
  unavailableReason: string | null = null;
  /** Extra note for the startup log (e.g. Wayland caveat); null when none. */
  sessionNote: string | null = null;

  private display: unknown = null;
  private keysymToKeycode: XKeysymToKeycodeFn | null = null;
  private fakeKeyEvent: XTestFakeKeyEventFn | null = null;
  private flush: XFlushFn | null = null;
  private readonly keycodeCache = new Map<number, number>();

  constructor() {
    if (process.platform !== 'linux') {
      this.unavailableReason = 'not a Linux session';
      return;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const koffi = require('koffi');
      const x11 = this.loadFirst(koffi, ['libX11.so.6', 'libX11.so']);
      const xtst = this.loadFirst(koffi, ['libXtst.so.6', 'libXtst.so.1', 'libXtst.so']);
      if (!x11 || !xtst) {
        this.unavailableReason =
          'libX11/libXtst could not load (on Debian/Ubuntu: sudo apt install libxtst6 libx11-6)';
        return;
      }
      const openDisplay = x11.func('XOpenDisplay', 'void *', [
        'char *',
      ]) as XOpenDisplayFn;
      this.keysymToKeycode = x11.func('XKeysymToKeycode', 'uint32', [
        'void *',
        'uint64',
      ]) as XKeysymToKeycodeFn;
      this.fakeKeyEvent = xtst.func('XTestFakeKeyEvent', 'int32', [
        'void *',
        'uint32',
        'int32',
        'uint64',
      ]) as XTestFakeKeyEventFn;
      this.flush = x11.func('XFlush', 'int32', ['void *']) as XFlushFn;
      this.display = openDisplay(null);
      if (!this.display) {
        this.unavailableReason =
          'no X11 display (DISPLAY is unset) — on a pure Wayland session there is nothing to send keys to';
        return;
      }
      this.available = true;
      if (process.env.XDG_SESSION_TYPE === 'wayland') {
        this.sessionNote =
          'Wayland session: replacement reaches X11/XWayland apps; native Wayland apps cannot receive synthetic keys.';
      }
    } catch {
      this.available = false;
      this.unavailableReason = 'X11/XTest libraries could not load';
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private loadFirst(koffi: any, names: string[]): any | null {
    for (const name of names) {
      try {
        return koffi.load(name);
      } catch {
        // try the next soname
      }
    }
    return null;
  }

  private keycodeFor(keysym: number): number {
    const cached = this.keycodeCache.get(keysym);
    if (cached !== undefined) return cached;
    if (!this.keysymToKeycode || !this.display) {
      throw new Error('XTest is unavailable');
    }
    const keycode = this.keysymToKeycode(this.display, keysym);
    if (!keycode) {
      throw new Error(
        `No keycode for keysym 0x${keysym.toString(16)} on this keyboard layout`,
      );
    }
    this.keycodeCache.set(keysym, keycode);
    return keycode;
  }

  private send(actions: X11KeyAction[]): void {
    if (!this.fakeKeyEvent || !this.flush || !this.display) {
      throw new Error('XTest is unavailable');
    }
    for (const action of actions) {
      const keycode = this.keycodeFor(action.keysym);
      // koffi rejects a JS boolean where the signature declares a
      // number — XTest's is_press must go as 1/0, not true/false.
      this.fakeKeyEvent(this.display, keycode, action.press ? 1 : 0, 0);
    }
    this.flush(this.display);
  }

  /** Paste `text` at the caret, restoring the user's clipboard after. */
  private async pasteText(text: string): Promise<void> {
    const formats = clipboard.availableFormats();
    const hadText = formats.some((f) => f === 'text/plain' || f.startsWith('text/'));
    const previousText = hadText ? clipboard.readText() : '';
    const restoreClipboard = () => {
      if (hadText) clipboard.writeText(previousText);
      else clipboard.clear(); // nothing restorable; don't leave our text behind
    };
    clipboard.writeText(text);
    await sleep(20);
    if (clipboard.readText() !== text) {
      // The write did not take — retry once, then fail loudly
      // instead of pasting whatever happens to be on the clipboard.
      clipboard.writeText(text);
      await sleep(20);
      if (clipboard.readText() !== text) {
        restoreClipboard();
        throw new Error('Could not place the translation on the clipboard');
      }
    }
    this.send(planX11PasteShortcut());
    // Give the target app ample time to consume the clipboard before
    // restoring: restoring too early makes a busy app paste the OLD
    // clipboard contents.
    await sleep(250);
    restoreClipboard();
  }

  async replaceWord(
    wordLength: number,
    replacement: string,
    delimiter: string,
  ): Promise<void> {
    if (!this.available) throw new Error('Text injection is unavailable');

    // 1) Delete the delimiter + the word (right to left from the caret).
    this.send(planX11Backspaces(wordLength + 1));

    // 2) Paste the translation, restoring the user's clipboard after.
    await this.pasteText(replacement);

    // 3) Re-emit the delimiter the user originally typed.
    const plan = planX11Delimiter(delimiter);
    if (plan.kind === 'keys') this.send(plan.actions);
    else await this.pasteText(plan.text);
  }
}
