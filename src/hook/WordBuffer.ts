import type { KeyEventLike } from './KeyHook';

export interface CompletedWord {
  /** Exactly as typed, case preserved. */
  word: string;
  /** The delimiter that completed the word: ' ', '\n', '\t', ',', '.', … */
  delimiter: string;
}

/** Delimiters that end a "sequence" (email/URL) as well as a word. */
const SEQUENCE_ENDERS = new Set([' ', '\n', '\t']);

const LETTER_OR_MARK = /[\p{L}\p{M}]/u;
const DIGIT = /\p{Nd}/u;
/** Characters that may appear inside a word ("don't", "well-known"). */
const INTERNAL = new Set(["'", '’', '-']);

/**
 * Keeps ONLY the current word in memory. Nothing here ever touches disk.
 *
 * Rules (from the spec):
 * - A word completes on a delimiter; the buffer then clears.
 * - Backspace edits the buffer. Esc / arrows / Home / End / mouse click /
 *   focus change / Ctrl-Alt-Win combos arrive as 'reset' or 'modifier'
 *   events and clear the buffer.
 * - Skipped on completion: pure numbers, words containing digits, and
 *   words that are part of an email address or URL. Emails/URLs are
 *   detected by a symbol (@ / # _ = : etc.) "tainting" the sequence; the
 *   taint survives punctuation delimiters (the ".com" in an address) and
 *   clears only on space / Enter / Tab.
 * - Letters are Unicode letters or combining marks in any script, so
 *   Bengali and Arabic words — including Bengali vowel signs, which are
 *   combining marks — stay in one piece.
 */
export class WordBuffer {
  private chars: string[] = [];
  private tainted = false;

  get current(): string {
    return this.chars.join('');
  }

  reset(): void {
    this.chars = [];
    this.tainted = false;
  }

  handle(event: KeyEventLike): CompletedWord | null {
    switch (event.type) {
      case 'reset':
      case 'modifier':
      case 'hotkey':
      case 'paste':
      case 'mouse':
        // A paste abandons whatever word was being typed; the pasted
        // text itself is handled by the paste-offer flow (M5.14).
        // A mouse press likewise means a new field/app (M5.16: mouse
        // events now carry button/position instead of a bare reset).
        this.reset();
        return null;

      case 'backspace':
        this.chars.pop();
        if (this.chars.length === 0) this.tainted = false;
        return null;

      case 'char': {
        const ch = event.char ?? '';
        if (LETTER_OR_MARK.test(ch) || DIGIT.test(ch)) {
          this.chars.push(ch);
        } else if (INTERNAL.has(ch)) {
          if (this.chars.length > 0) this.chars.push(ch);
        } else if (ch !== '') {
          // Any other symbol (@ / # _ = \ + …) means this sequence is an
          // email, URL, path or code — never a translatable word.
          this.tainted = true;
        }
        return null;
      }

      case 'delimiter': {
        const delimiter = event.char ?? ' ';
        const word = this.current;
        const valid = this.isTranslatable(word);
        this.chars = [];
        if (SEQUENCE_ENDERS.has(delimiter)) {
          this.tainted = false;
        }
        // A punctuation delimiter inside a tainted sequence (e.g. the "."
        // in an email) leaves the taint in place for the next fragment.
        return valid ? { word, delimiter } : null;
      }
    }
  }

  private isTranslatable(word: string): boolean {
    if (this.tainted || word.length === 0) return false;
    let hasLetter = false;
    const parts = [...word];
    for (let i = 0; i < parts.length; i++) {
      const ch = parts[i];
      if (LETTER_OR_MARK.test(ch)) {
        hasLetter = true;
      } else if (DIGIT.test(ch)) {
        return false; // words with digits, and pure numbers
      } else if (INTERNAL.has(ch)) {
        if (i === 0 || i === parts.length - 1) return false;
      } else {
        return false;
      }
    }
    return hasLetter;
  }
}

/** Human-readable delimiter for the dev-console log. */
export function delimiterLabel(delimiter: string): string {
  switch (delimiter) {
    case ' ':
      return 'Space';
    case '\n':
      return 'Enter';
    case '\t':
      return 'Tab';
    default:
      return delimiter;
  }
}

/**
 * "U+0986 U+09AE U+09BF" style listing. Used by the debug log so a word can
 * be verified even when the terminal cannot draw Bengali glyphs (a console
 * codepage/font problem can make correct text look like mojibake).
 */
export function codePointsOf(word: string): string {
  return [...word]
    .map((ch) => `U+${(ch.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`)
    .join(' ');
}
