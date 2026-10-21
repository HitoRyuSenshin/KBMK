/**
 * Text replacement behind an interface (same pattern as KeyHook), so
 * the replacement logic is unit-testable with a fake and the Windows
 * implementation can change without touching callers. The Windows
 * implementation is WindowsTextInjector (SendInput + clipboard paste).
 */
export interface TextInjector {
  /** False when injection is impossible on this platform/build. */
  readonly available: boolean;
  /**
   * Delete `wordLength + 1` characters (the word + the delimiter the
   * user just typed), insert `replacement`, then re-emit `delimiter`.
   * `wordLength` counts UTF-16 code units (the string's length) —
   * Windows editors delete exactly one code unit per Backspace,
   * combining marks included (verified on Windows 11 Notepad, M4.1).
   * Clipboard contents must be saved and restored by implementations.
   */
  replaceWord(
    wordLength: number,
    replacement: string,
    delimiter: string,
  ): Promise<void>;
}

/** Fake that records calls, for unit tests. Never touches real input. */
export class FakeTextInjector implements TextInjector {
  readonly available = true;
  readonly calls: Array<{ wordLength: number; replacement: string; delimiter: string }> = [];

  async replaceWord(
    wordLength: number,
    replacement: string,
    delimiter: string,
  ): Promise<void> {
    this.calls.push({ wordLength, replacement, delimiter });
  }
}
