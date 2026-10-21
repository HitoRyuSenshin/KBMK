import { describe, expect, it } from 'vitest';
import { WordBuffer, codePointsOf, delimiterLabel, type CompletedWord } from '../src/hook/WordBuffer';
import type { KeyEventLike } from '../src/hook/KeyHook';

/** Feed a string as char events (a final char may be passed as a delimiter). */
function type(buffer: WordBuffer, text: string): CompletedWord[] {
  const done: CompletedWord[] = [];
  for (const ch of text) {
    const r = buffer.handle({ type: 'char', char: ch });
    if (r) done.push(r);
  }
  return done;
}

function finish(buffer: WordBuffer, delimiter = ' '): CompletedWord | null {
  return buffer.handle({ type: 'delimiter', char: delimiter });
}

describe('WordBuffer', () => {
  it('completes a word on space and clears for the next word', () => {
    const b = new WordBuffer();
    type(b, 'hello');
    expect(finish(b)).toEqual({ word: 'hello', delimiter: ' ' });
    expect(b.current).toBe('');
    type(b, 'world');
    expect(finish(b, '.')).toEqual({ word: 'world', delimiter: '.' });
  });

  it('completes on every spec delimiter', () => {
    for (const d of [' ', '\n', '\t', ',', '.', '!', '?', ';', ':']) {
      const b = new WordBuffer();
      type(b, 'word');
      expect(finish(b, d)).toEqual({ word: 'word', delimiter: d });
    }
  });

  it('empty buffer completes nothing', () => {
    const b = new WordBuffer();
    expect(finish(b)).toBeNull();
  });

  it('backspace edits the buffer, including deleting to empty', () => {
    const b = new WordBuffer();
    type(b, 'helo');
    b.handle({ type: 'backspace' });
    type(b, 'lo');
    expect(finish(b)).toEqual({ word: 'hello', delimiter: ' ' });

    type(b, 'ab');
    b.handle({ type: 'backspace' });
    b.handle({ type: 'backspace' });
    expect(finish(b)).toBeNull();
  });

  it('reset and modifier events abandon the word', () => {
    for (const ev of [{ type: 'reset' }, { type: 'modifier' }] as KeyEventLike[]) {
      const b = new WordBuffer();
      type(b, 'partial');
      b.handle(ev);
      expect(finish(b)).toBeNull();
    }
  });

  it('preserves capitalisation exactly as typed', () => {
    const b = new WordBuffer();
    type(b, 'Hello');
    expect(finish(b)?.word).toBe('Hello');
  });

  it('keeps Unicode words together: Bengali (with combining vowel sign) and Arabic', () => {
    const bn = new WordBuffer();
    type(bn, 'আমি'); // আ + ম + ি (combining mark)
    expect(finish(bn)?.word).toBe('আমি');

    const ar = new WordBuffer();
    type(ar, 'سلام');
    expect(finish(ar)?.word).toBe('سلام');
  });

  it("keeps internal apostrophes and hyphens: don't, well-known", () => {
    const b = new WordBuffer();
    type(b, "don't");
    expect(finish(b)?.word).toBe("don't");
    type(b, 'well-known');
    expect(finish(b)?.word).toBe('well-known');
  });

  it('skips pure numbers and words containing digits', () => {
    const b = new WordBuffer();
    type(b, '123');
    expect(finish(b)).toBeNull();
    type(b, 'abc123');
    expect(finish(b)).toBeNull();
    type(b, 'ok');
    expect(finish(b)?.word).toBe('ok');
  });

  it('skips an email address, including the fragment after the dot', () => {
    const b = new WordBuffer();
    type(b, 'user@example');
    const completions = [
      finish(b, '.'),
      ...type(b, 'com'),
      finish(b, ' '),
    ].filter((r) => r !== null);
    expect(completions).toEqual([]);
    // …and the next real word is clean again.
    type(b, 'hello');
    expect(finish(b)?.word).toBe('hello');
  });

  it('skips the part of a URL after a slash', () => {
    const b = new WordBuffer();
    type(b, 'some/path');
    expect(finish(b, ' ')).toBeNull();
  });

  it('a digit typed then fully backspaced does not poison the next word', () => {
    const b = new WordBuffer();
    type(b, '7');
    b.handle({ type: 'backspace' });
    type(b, 'go');
    expect(finish(b)?.word).toBe('go');
  });
});

describe('delimiterLabel', () => {
  it('names whitespace delimiters and passes punctuation through', () => {
    expect(delimiterLabel(' ')).toBe('Space');
    expect(delimiterLabel('\n')).toBe('Enter');
    expect(delimiterLabel('\t')).toBe('Tab');
    expect(delimiterLabel('.')).toBe('.');
  });
});

describe('codePointsOf', () => {
  it('lists Bengali and Latin code points as ASCII', () => {
    expect(codePointsOf('আমি')).toBe('U+0986 U+09AE U+09BF');
    expect(codePointsOf('Hi')).toBe('U+0048 U+0069');
  });
});
