import { describe, expect, it } from 'vitest';
import { classifyText } from '../src/hook/vkChar';
import { WordBuffer } from '../src/hook/WordBuffer';

/**
 * M4.2 regression: the Bengali danda । (U+0964) ends a sentence in
 * Bengali the way "." does in English. Before the fix it was classified
 * as a symbol character, which tainted the sequence in WordBuffer — the
 * word before it never completed and never translated.
 */
describe('Bengali danda delimiter', () => {
  it('classifyText treats । and ॥ as delimiters', () => {
    expect(classifyText('।')).toEqual([{ type: 'delimiter', char: '।' }]);
    expect(classifyText('॥')).toEqual([{ type: 'delimiter', char: '॥' }]);
  });

  it('a Bengali word followed by । completes and is translatable', () => {
    const buffer = new WordBuffer();
    for (const ch of 'আমি') buffer.handle({ type: 'char', char: ch });
    for (const event of classifyText('।')) {
      const done = buffer.handle(event);
      expect(done).toEqual({ word: 'আমি', delimiter: '।' });
    }
  });

  it('the danda does not taint the next word either', () => {
    const buffer = new WordBuffer();
    for (const ch of 'ভালো') buffer.handle({ type: 'char', char: ch });
    buffer.handle({ type: 'delimiter', char: '।' });
    for (const ch of 'আছি') buffer.handle({ type: 'char', char: ch });
    expect(buffer.handle({ type: 'delimiter', char: ' ' })).toEqual({
      word: 'আছি',
      delimiter: ' ',
    });
  });
});
