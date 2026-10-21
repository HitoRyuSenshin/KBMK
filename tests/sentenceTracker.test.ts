import { describe, expect, it } from 'vitest';
import {
  SentenceTracker,
  normalizeSentenceText,
  sentenceDiffers,
} from '../src/hook/SentenceTracker';

/** Type a word char by char, as the hook would feed the tracker. */
function type(t: SentenceTracker, text: string): void {
  for (const ch of text) t.char(ch);
}

/** A word completes and settles with the given on-screen text. */
function settleWord(
  t: SentenceTracker,
  word: string,
  delimiter: string,
  screen: string,
) {
  t.beginWord(word, delimiter);
  return t.finishWord(word, screen);
}

describe('SentenceTracker', () => {
  it('builds a sentence from settled words: source as typed, screen as translated', () => {
    const t = new SentenceTracker();
    type(t, 'I');
    expect(settleWord(t, 'I', ' ', 'আমি')).toBeNull();
    type(t, 'eat');
    expect(settleWord(t, 'eat', ' ', 'খাই')).toBeNull();
    type(t, 'rice');
    const done = settleWord(t, 'rice', '.', 'ভাত');
    expect(done).toEqual({
      sourceText: 'I eat rice.',
      screenText: 'আমি খাই ভাত.',
      terminator: '.',
    });
  });

  it('keeps a word that was left as typed (skipped) verbatim in both texts', () => {
    const t = new SentenceTracker();
    type(t, 'Hello');
    settleWord(t, 'Hello', ' ', 'Hello'); // same-text skip: screen = source
    type(t, 'world');
    const done = settleWord(t, 'world', '!', 'world');
    expect(done?.sourceText).toBe('Hello world!');
    expect(done?.screenText).toBe('Hello world!');
  });

  it('reconstructs skipped tokens (numbers) from raw chars via verbatim', () => {
    const t = new SentenceTracker();
    type(t, 'I');
    settleWord(t, 'I', ' ', 'আমি');
    type(t, 'have');
    settleWord(t, 'have', ' ', 'আছে');
    type(t, '3');
    expect(t.verbatim('.')).toBeNull(); // the decimal point ends nothing
    type(t, '14');
    expect(t.verbatim(' ')).toBeNull();
    type(t, 'cats');
    const done = settleWord(t, 'cats', '.', 'বিড়াল');
    expect(done?.sourceText).toBe('I have 3.14 cats.');
    expect(done?.screenText).toBe('আমি আছে 3.14 বিড়াল.');
  });

  it('appends bare delimiters (the space after a comma) verbatim', () => {
    const t = new SentenceTracker();
    type(t, 'Well');
    settleWord(t, 'Well', ',', 'Well');
    expect(t.verbatim(' ')).toBeNull();
    type(t, 'ok');
    const done = settleWord(t, 'ok', '.', 'ok');
    expect(done?.sourceText).toBe('Well, ok.');
  });

  it('Enter ends a sentence: the newline leaves the API text but stays in the span', () => {
    const t = new SentenceTracker();
    type(t, 'good');
    settleWord(t, 'good', ' ', 'ভালো');
    type(t, 'morning');
    const done = settleWord(t, 'morning', '\n', 'সকাল');
    expect(done?.sourceText).toBe('good morning');
    expect(done?.screenText).toBe('ভালো সকাল\n');
    expect(done?.terminator).toBe('\n');
  });

  it('a danda ends a Bengali sentence', () => {
    const t = new SentenceTracker();
    type(t, 'আমি');
    const done = settleWord(t, 'আমি', '।', 'I');
    expect(done?.terminator).toBe('।');
    expect(done?.sourceText).toBe('আমি।');
  });

  it('backspace edits the pending chunk, but backspace into settled text voids the sentence', () => {
    const t = new SentenceTracker();
    type(t, 'Helo');
    t.backspace(); // fixes the typo inside the pending chunk: "Hel"
    type(t, 'lo');
    settleWord(t, 'Hello', ' ', 'Hola');
    t.backspace(); // eats the space after the settled word
    type(t, 'world');
    expect(settleWord(t, 'world', '.', 'mundo')).toBeNull();
  });

  it('an out-of-order settle voids the sentence and the one after it; then it recovers', () => {
    const t = new SentenceTracker();
    type(t, 'one');
    t.beginWord('one', ' ');
    type(t, 'two');
    t.beginWord('two', '.');
    // "two" settles first (cache hit) while "one" is still in flight:
    expect(t.finishWord('two', 'dos')).toBeNull();
    expect(t.finishWord('one', 'uno')).toBeNull(); // queue already voided
    // The voided sentence's terminator was lost inside the cleared
    // queue, so the next sentence's terminator is the one that
    // clears the broken flag — it is sacrificed too, never guessed at.
    type(t, 'fresh');
    expect(settleWord(t, 'fresh', '.', 'fresco')).toBeNull();
    type(t, 'again');
    const done = settleWord(t, 'again', '.', 'otra vez');
    expect(done?.sourceText).toBe('again.');
  });

  it('a decimal point does not end the sentence mid-number', () => {
    const t = new SentenceTracker();
    type(t, 'Pi');
    settleWord(t, 'Pi', ' ', 'Pi');
    type(t, 'is');
    settleWord(t, 'is', ' ', 'is');
    type(t, '3');
    expect(t.verbatim('.')).toBeNull();
    type(t, '14');
    expect(t.verbatim(' ')).toBeNull();
    type(t, 'exactly');
    const done = settleWord(t, 'exactly', '.', 'exactly');
    expect(done?.sourceText).toBe('Pi is 3.14 exactly.');
  });

  it('an in-order settle across two in-flight words still completes', () => {
    const t = new SentenceTracker();
    type(t, 'one');
    t.beginWord('one', ' ');
    type(t, 'two');
    t.beginWord('two', '.');
    expect(t.finishWord('one', 'uno')).toBeNull();
    const done = t.finishWord('two', 'dos');
    expect(done?.sourceText).toBe('one two.');
    expect(done?.screenText).toBe('uno dos.');
  });

  it('a null screen text (replacement threw) voids the sentence', () => {
    const t = new SentenceTracker();
    type(t, 'boom');
    t.beginWord('boom', '.');
    expect(t.finishWord('boom', null)).toBeNull();
  });

  it('a verbatim chunk behind unsettled words keeps its place in the span', () => {
    const t = new SentenceTracker();
    type(t, 'word');
    t.beginWord('word', ' ');
    type(t, '42');
    expect(t.verbatim('.')).toBeNull(); // a decimal point ends nothing
    expect(t.finishWord('word', 'palabra')).toBeNull();
    expect(t.verbatim(' ')).toBeNull();
    type(t, 'cats');
    const done = settleWord(t, 'cats', '.', 'gatos');
    expect(done?.sourceText).toBe('word 42. cats.');
    expect(done?.screenText).toBe('palabra 42. gatos.');
  });

  it('the space after a comma lands while the comma word is still translating', () => {
    // Regression (user log, 2026-10-21): every comma'd sentence lost
    // its offer, because the space after the comma is a bare delimiter
    // that arrived while the comma's word was still unsettled — the
    // old tracker voided the sentence on the spot.
    const t = new SentenceTracker();
    type(t, 'Now');
    t.beginWord('Now', ',');
    expect(t.verbatim(' ')).toBeNull();
    type(t, 'let');
    t.beginWord('let', ' ');
    type(t, 'me');
    t.beginWord('me', ' ');
    type(t, 'see');
    t.beginWord('see', '.');
    expect(t.finishWord('Now', 'এখন')).toBeNull();
    expect(t.finishWord('let', 'লেট')).toBeNull();
    expect(t.finishWord('me', 'আমি')).toBeNull();
    const done = t.finishWord('see', 'দেখুন');
    expect(done?.sourceText).toBe('Now, let me see.');
    expect(done?.screenText).toBe('এখন, লেট আমি দেখুন.');
  });

  it('a bare terminator behind an unsettled word completes once it settles', () => {
    const t = new SentenceTracker();
    type(t, 'wait');
    t.beginWord('wait', ' ');
    expect(t.verbatim('!')).toBeNull(); // the '!' is its own chunk
    const done = t.finishWord('wait', 'wait');
    expect(done?.sourceText).toBe('wait !');
    expect(done?.terminator).toBe('!');
  });

  it('a doubled space while a word is unsettled does not void the sentence', () => {
    const t = new SentenceTracker();
    type(t, 'go');
    t.beginWord('go', ' ');
    expect(t.verbatim(' ')).toBeNull(); // the accidental second space
    type(t, 'now');
    t.beginWord('now', '.');
    expect(t.finishWord('go', 'go')).toBeNull();
    const done = t.finishWord('now', 'now');
    expect(done?.sourceText).toBe('go  now.');
  });

  it('a sentence with no letters earns no offer', () => {
    const t = new SentenceTracker();
    type(t, '42');
    expect(t.verbatim('.')).toBeNull();
  });

  it('an overlong sentence earns no offer', () => {
    const t = new SentenceTracker();
    const word = 'a'.repeat(301);
    type(t, word);
    expect(settleWord(t, word, '.', word)).toBeNull();
  });

  it('chars typed toward the next sentence survive a completion', () => {
    const t = new SentenceTracker();
    type(t, 'Hi');
    t.beginWord('Hi', '.');
    type(t, 'ne'); // already typing the next sentence during translation
    const first = t.finishWord('Hi', 'Hola');
    expect(first?.sourceText).toBe('Hi.');
    type(t, 'xt');
    t.beginWord('next', ' ');
    expect(t.finishWord('next', 'siguiente')).toBeNull();
    type(t, 'one');
    const second = settleWord(t, 'one', '.', 'uno');
    expect(second?.sourceText).toBe('next one.');
  });

  it('leading separators are not part of the sentence or its span', () => {
    const t = new SentenceTracker();
    expect(t.verbatim(' ')).toBeNull(); // a space before anything was typed
    type(t, 'Hello');
    const done = settleWord(t, 'Hello', '.', 'Hola');
    expect(done?.sourceText).toBe('Hello.');
    expect(done?.screenText).toBe('Hola.');
  });

  it('a stray terminator on an empty tracker is ignored', () => {
    const t = new SentenceTracker();
    expect(t.verbatim('.')).toBeNull();
    type(t, 'Real');
    const done = settleWord(t, 'Real', '.', 'Real');
    expect(done?.sourceText).toBe('Real.');
  });

  it('reset drops everything, including an in-flight word', () => {
    const t = new SentenceTracker();
    type(t, 'gone');
    t.beginWord('gone', '.');
    t.reset();
    expect(t.finishWord('gone', 'ido')).toBeNull();
    type(t, 'back');
    const done = settleWord(t, 'back', '.', 'atrás');
    expect(done?.sourceText).toBe('back.');
  });
});

describe('SentenceTracker loss reporting', () => {
  function lossHarness() {
    const losses: Array<[string, string]> = [];
    const t = new SentenceTracker((reason, partial) => losses.push([reason, partial]));
    return { t, losses };
  }

  it('reports a backspace into settled text, once, with the partial sentence', () => {
    const { t, losses } = lossHarness();
    type(t, 'Hello');
    settleWord(t, 'Hello', ' ', 'Hola');
    t.backspace(); // eats the settled space
    t.backspace(); // a second one must not report again
    expect(losses).toEqual([['backspace into the sentence', 'Hello ']]);
  });

  it('reports a null screen as a failed swap', () => {
    const { t, losses } = lossHarness();
    type(t, 'boom');
    t.beginWord('boom', '.');
    expect(t.finishWord('boom', null)).toBeNull();
    expect(losses).toEqual([['a replacement failed mid-swap', 'boom.']]);
  });

  it('reports an out-of-order settle', () => {
    const { t, losses } = lossHarness();
    type(t, 'one');
    t.beginWord('one', ' ');
    type(t, 'two');
    t.beginWord('two', '.');
    expect(t.finishWord('two', 'dos')).toBeNull();
    expect(losses).toEqual([['a word settled out of order', 'one two.']]);
  });

  it('partialSource spans settled text, segments and the pending chunk', () => {
    const { t } = lossHarness();
    type(t, 'Well');
    settleWord(t, 'Well', ',', 'Well');
    expect(t.verbatim(' ')).toBeNull();
    type(t, 'ok');
    t.beginWord('ok', ' ');
    type(t, 'fi');
    expect(t.partialSource).toBe('Well, ok fi');
    expect(t.hasContent).toBe(true);
  });

  it('a clean sentence reports nothing', () => {
    const { t, losses } = lossHarness();
    type(t, 'clean');
    expect(settleWord(t, 'clean', '.', 'limpio')?.sourceText).toBe('clean.');
    expect(losses).toEqual([]);
    expect(t.hasContent).toBe(false);
  });
});

describe('sentence text comparison', () => {
  it('normalizes whitespace runs and trims', () => {
    expect(normalizeSentenceText('  আমি  খাই\nভাত। ')).toBe('আমি খাই ভাত।');
  });

  it('whitespace-only differences do not count as a difference', () => {
    expect(sentenceDiffers('আমি খাই ভাত।', 'আমি  খাই  ভাত।')).toBe(false);
    expect(sentenceDiffers('ভালো সকাল\n', 'ভালো সকাল')).toBe(false);
  });

  it('real differences count', () => {
    expect(sentenceDiffers('আমি খাই ভাত.', 'আমি ভাত খাই।')).toBe(true);
  });
});
