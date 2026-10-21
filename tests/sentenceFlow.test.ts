import { describe, expect, it } from 'vitest';
import { ReplacementCoordinator } from '../src/inject/ReplacementCoordinator';
import { FakeTextInjector } from '../src/inject/TextInjector';
import { SentenceTracker, type SentenceCompletion } from '../src/hook/SentenceTracker';
import type { TranslateOutcome } from '../src/providers/TranslationService';

/**
 * The wiring contract main.ts follows (M7), exercised end to end with
 * fakes: key events feed the tracker, completions go through the
 * coordinator, settles feed the tracker back, a closed sentence is
 * prepared as an offer, Space accepts it, Ctrl+Alt+Z undoes it.
 */
describe('sentence offer flow (tracker + coordinator, as wired in main)', () => {
  it('draft → offer → accept → undo', async () => {
    const words: Record<string, string> = { I: 'আমি', eat: 'খাই', rice: 'ভাত' };
    const translate = async (text: string): Promise<TranslateOutcome> => ({
      text: text === 'I eat rice.' ? 'আমি ভাত খাই।' : (words[text] ?? text),
      cached: false,
      providerId: 'google',
      durationMs: 5,
    });
    const injector = new FakeTextInjector();
    const tracker = new SentenceTracker();
    let completion: SentenceCompletion | null = null;
    const generation = 42;
    const coordinator = new ReplacementCoordinator({
      injector,
      translate,
      isEnabled: () => true,
      generation: () => generation,
      setInjecting: () => {},
      guardReleaseMs: 1,
      callbacks: {
        onSettled: (word, screenText) => {
          completion = tracker.finishWord(word, screenText) ?? completion;
        },
      },
    });

    // Type "I eat rice." — each word completes, translates, replaces.
    for (const [word, delimiter] of [
      ['I', ' '],
      ['eat', ' '],
      ['rice', '.'],
    ] as const) {
      for (const ch of word) tracker.char(ch);
      tracker.beginWord(word, delimiter);
      await coordinator.handleCompleted({ word, delimiter }, generation, 'en', 'bn');
    }

    expect(completion).toEqual({
      sourceText: 'I eat rice.',
      screenText: 'আমি খাই ভাত.',
      terminator: '.',
    });
    // Three word swaps happened along the way.
    expect(injector.calls).toHaveLength(3);

    const offer = await coordinator.prepareSentenceOffer(
      completion!.sourceText,
      completion!.screenText,
      completion!.terminator,
      'en',
      'bn',
    );
    expect(offer?.inserted).toBe('আমি ভাত খাই।');

    // Space accepts: the whole draft sentence is swapped at once.
    await coordinator.acceptSentenceOffer({ ...offer!, terminator: '.' }, generation);
    expect(injector.calls[3]).toEqual({
      wordLength: 'আমি খাই ভাত.'.length,
      replacement: 'আমি ভাত খাই।',
      delimiter: ' ',
    });

    // Ctrl+Alt+Z restores the word-by-word draft.
    await coordinator.undoLast();
    expect(injector.calls[4]).toEqual({
      wordLength: 'আমি ভাত খাই।'.length,
      replacement: 'আমি খাই ভাত.',
      delimiter: ' ',
    });
  });

  it('an identical sentence translation still yields a display-only offer', async () => {
    const translate = async (text: string): Promise<TranslateOutcome> => ({
      text, // identity provider: nothing ever changes
      cached: false,
      providerId: 'google',
      durationMs: 1,
    });
    const coordinator = new ReplacementCoordinator({
      injector: new FakeTextInjector(),
      translate,
      isEnabled: () => true,
      generation: () => 1,
      setInjecting: () => {},
    });
    const offer = await coordinator.prepareSentenceOffer(
      'Stay as typed.',
      'Stay as typed.',
      '.',
      'en',
      'es',
    );
    expect(offer?.identical).toBe(true);
    expect(offer?.inserted).toBe('Stay as typed.');
  });
});
