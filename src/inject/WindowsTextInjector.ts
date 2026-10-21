import { clipboard } from 'electron';
import { INJECT_MAGIC } from '../shared/injectMagic';
import type { TextInjector } from './TextInjector';
import {
  INPUT_RECORD_SIZE,
  buildInputBuffer,
  planBackspaces,
  planDelimiter,
  planPasteShortcut,
  type KeyStroke,
} from './keyPlan';

/**
 * Windows text injection via SendInput (user32), driven through koffi —
 * the same FFI library the keyboard hook already uses, so M4 adds no
 * new native dependency (no nut-js). Text itself is inserted by
 * clipboard paste, which is the only reliable way to deliver arbitrary
 * Unicode (incl. Bengali) into every app; the clipboard's previous text
 * is saved and restored around the paste.
 *
 * Every synthetic key carries dwExtraInfo = INJECT_MAGIC so the
 * low-level hook can ignore KBMK's own output. In addition the caller
 * holds the hooks' `injecting` guard for the duration (see
 * ReplacementCoordinator), so nothing we emit can feed the word buffer.
 *
 * Windows-only: needs user test. On other platforms, or if koffi /
 * SendInput cannot load, `available` stays false and the app remains in
 * M3's log-only mode.
 */

type SendInputFn = (count: number, inputs: Buffer, size: number) => number;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class WindowsTextInjector implements TextInjector {
  available = false;
  private sendInput: SendInputFn | null = null;

  constructor() {
    if (process.platform !== 'win32') return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const koffi = require('koffi');
      const user32 = koffi.load('user32.dll');
      this.sendInput = user32.func('SendInput', 'uint32', [
        'uint32',
        'void *',
        'int32',
      ]) as SendInputFn;
      this.available = this.sendInput !== null;
    } catch {
      this.available = false;
      this.sendInput = null;
    }
  }

  private send(strokes: KeyStroke[]): void {
    if (!this.sendInput) throw new Error('SendInput is unavailable');
    if (strokes.length === 0) return;
    const buffer = buildInputBuffer(strokes, INJECT_MAGIC);
    const sent = this.sendInput(strokes.length, buffer, INPUT_RECORD_SIZE);
    if (sent !== strokes.length) {
      throw new Error(`SendInput delivered ${sent} of ${strokes.length} keys`);
    }
  }

  async replaceWord(
    wordLength: number,
    replacement: string,
    delimiter: string,
  ): Promise<void> {
    if (!this.available) throw new Error('Text injection is unavailable');

    // 1) Delete the delimiter + the word (right to left from the caret).
    this.send(planBackspaces(wordLength + 1));

    // 2) Paste the translation, restoring the user's clipboard after.
    const formats = clipboard.availableFormats();
    const hadText = formats.some((f) => f === 'text/plain' || f.startsWith('text/'));
    const previousText = hadText ? clipboard.readText() : '';
    const restoreClipboard = () => {
      if (hadText) clipboard.writeText(previousText);
      else clipboard.clear(); // nothing restorable; don't leave our text behind
    };
    clipboard.writeText(replacement);
    await sleep(20);
    if (clipboard.readText() !== replacement) {
      // The write did not take (something else is holding the
      // clipboard). Retry once; if it still has not taken, fail
      // loudly instead of pasting whatever happens to be there —
      // a wrong paste is worse than a missed swap.
      clipboard.writeText(replacement);
      await sleep(20);
      if (clipboard.readText() !== replacement) {
        restoreClipboard();
        throw new Error('Could not place the translation on the clipboard');
      }
    }
    this.send(planPasteShortcut());

    // 3) Re-emit the delimiter the user originally typed.
    this.send(planDelimiter(delimiter));

    // 4) Only now restore the clipboard. A busy target app (Chrome
    // under load) can process Ctrl+V well after the keys were sent;
    // restoring too early makes it paste the OLD clipboard contents.
    await sleep(250);
    restoreClipboard();
  }
}
