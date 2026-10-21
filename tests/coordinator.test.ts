import { describe, expect, it } from 'vitest';
import { ReplacementCoordinator, type SkipReason } from '../src/inject/ReplacementCoordinator';
import { FakeTextInjector } from '../src/inject/TextInjector';
import type { TranslateOutcome } from '../src/providers/TranslationService';

const outcome = (text: string): TranslateOutcome => ({
  text,
  cached: false,
  providerId: 'google',
  durationMs: 5,
});

const DONE = { word: 'hello', delimiter: ' ' };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function harness(
  translateImpl: (w: string) => Promise<TranslateOutcome> = async () => outcome('hola'),
) {
  const injector = new FakeTextInjector();
  let generation = 10;
  let enabled = true;
  const guardStates: boolean[] = [];
  const events: string[] = [];
  const skips: SkipReason[] = [];
  const coordinator = new ReplacementCoordinator({
    injector,
    translate: async (w) => translateImpl(w),
    isEnabled: () => enabled,
    generation: () => generation,
    setInjecting: (v) => guardStates.push(v),
    guardReleaseMs: 5,
    callbacks: {
      onTranslated: () => events.push('translated'),
      onReplaced: () => events.push('replaced'),
      onSkipped: (_w, _i, reason) => skips.push(reason),
      onFailed: () => events.push('failed'),
      onUndone: () => events.push('undone'),
    },
  });
  return {
    injector,
    coordinator,
    guardStates,
    events,
    skips,
    bumpGeneration: () => generation++,
    setEnabled: (v: boolean) => {
      enabled = v;
    },
    gen: () => generation,
  };
}

describe('ReplacementCoordinator', () => {
  it('replaces the word: code-unit count, case applied, guard held then released', async () => {
    const h = harness(async () => outcome('hola'));
    await h.coordinator.handleCompleted({ word: 'Hello', delimiter: ' ' }, h.gen(), 'en', 'es');
    expect(h.injector.calls).toEqual([{ wordLength: 5, replacement: 'Hola', delimiter: ' ' }]);
    expect(h.events).toEqual(['translated', 'replaced']);
    expect(h.guardStates[0]).toBe(true);
    await sleep(20);
    expect(h.guardStates).toEqual([true, false]);
    expect(h.coordinator.canUndo).toBe(true);
  });

  it('deletes every code unit for Bengali words (আমি = 3 backspaces worth)', async () => {
    const h = harness(async () => outcome('I'));
    await h.coordinator.handleCompleted({ word: 'আমি', delimiter: ' ' }, h.gen(), 'bn', 'en');
    expect(h.injector.calls[0].wordLength).toBe(3);
  });

  it('skips replacement when the user typed on while translating', async () => {
    let release!: (o: TranslateOutcome) => void;
    const pending = new Promise<TranslateOutcome>((r) => (release = r));
    const h = harness(() => pending);
    const run = h.coordinator.handleCompleted(DONE, h.gen(), 'en', 'es');
    h.bumpGeneration(); // user typed the next word's first letter
    release(outcome('hola'));
    await run;
    expect(h.injector.calls).toEqual([]);
    expect(h.skips).toEqual(['typed-on']);
  });

  it('skips when disabled mid-flight, when identical, and with no injector', async () => {
    const h1 = harness();
    const p = h1.coordinator.handleCompleted(DONE, h1.gen(), 'en', 'es');
    h1.setEnabled(false);
    await p;
    expect(h1.skips).toEqual(['disabled']);

    const h2 = harness(async () => outcome('hello'));
    await h2.coordinator.handleCompleted(DONE, h2.gen(), 'en', 'es');
    expect(h2.skips).toEqual(['same-text']);
    expect(h2.injector.calls).toEqual([]);

    let translated = 0;
    const noInjector = new ReplacementCoordinator({
      injector: null,
      translate: async () => outcome('hola'),
      isEnabled: () => true,
      generation: () => 0,
      setInjecting: () => undefined,
      callbacks: {
        onTranslated: () => translated++,
        onSkipped: (_w, _i, reason) => expect(reason).toBe('no-injector'),
      },
    });
    await noInjector.handleCompleted(DONE, 0, 'en', 'es');
    expect(translated).toBe(1); // still translated + logged (M3 behavior)
  });

  it('translation failure: onFailed, no replacement, word untouched', async () => {
    const h = harness(async () => {
      throw new Error('boom');
    });
    await h.coordinator.handleCompleted(DONE, h.gen(), 'en', 'es');
    expect(h.events).toEqual(['failed']);
    expect(h.injector.calls).toEqual([]);
  });

  it('undo restores the original word with the same delimiter, once', async () => {
    const h = harness(async () => outcome('hola'));
    await h.coordinator.handleCompleted(DONE, h.gen(), 'en', 'es');
    await h.coordinator.undoLast();
    expect(h.injector.calls[1]).toEqual({ wordLength: 4, replacement: 'hello', delimiter: ' ' });
    expect(h.events).toContain('undone');
    expect(h.coordinator.canUndo).toBe(false);
    await h.coordinator.undoLast(); // nothing left to undo
    expect(h.injector.calls).toHaveLength(2);
  });

  it('undo of a Bengali replacement counts the inserted text correctly', async () => {
    const h = harness(async () => outcome('আমি'));
    await h.coordinator.handleCompleted({ word: 'I', delimiter: '.' }, h.gen(), 'en', 'bn');
    await h.coordinator.undoLast();
    // inserted আমি is 3 code units; original 'I' pasted back, delimiter '.'
    expect(h.injector.calls[1]).toEqual({ wordLength: 3, replacement: 'I', delimiter: '.' });
  });

  it('paste offer: prepare translates ahead (case applied); accept swaps the full pasted token', async () => {
    const h = harness(async () => outcome('hello'));
    const offer = await h.coordinator.preparePasteOffer('Hola', 'es', 'en');
    expect(offer?.inserted).toBe('Hello'); // source case applied
    expect(h.injector.calls).toEqual([]); // nothing replaced yet
    await h.coordinator.acceptPasteOffer(
      { ...offer!, originalToken: 'Hola.', suffix: '.' },
      h.gen(),
    );
    // Deletion counts the FULL token as pasted (incl. '.'), the swap
    // reattaches the punctuation to the translation.
    expect(h.injector.calls).toEqual([{ wordLength: 5, replacement: 'Hello.', delimiter: ' ' }]);
    expect(h.events).toContain('replaced');
    // And the accepted paste swap is undoable like any replacement.
    await h.coordinator.undoLast();
    expect(h.injector.calls[1]).toEqual({ wordLength: 6, replacement: 'Hola.', delimiter: ' ' });
  });

  it('paste offer: no offer when the word already reads as its translation', async () => {
    const h = harness(async () => outcome('hello'));
    expect(await h.coordinator.preparePasteOffer('hello', 'en', 'es')).toBeNull();
  });

  it('paste offer: prepare returns null on translation failure', async () => {
    const h = harness(async () => {
      throw new Error('offline');
    });
    expect(await h.coordinator.preparePasteOffer('hola', 'es', 'en')).toBeNull();
    expect(h.events).toContain('failed');
  });

  it('paste offer: accept is skipped when the user typed on (generation moved)', async () => {
    const h = harness(async () => outcome('hello'));
    const offer = await h.coordinator.preparePasteOffer('hola', 'es', 'en');
    const atAccept = h.gen();
    h.bumpGeneration(); // user pressed another key before Space
    await h.coordinator.acceptPasteOffer({ ...offer!, originalToken: 'hola', suffix: '' }, atAccept);
    expect(h.injector.calls).toEqual([]);
    expect(h.skips).toContain('typed-on');
  });
});

describe('ReplacementCoordinator sentence offers (M7)', () => {
  function sentenceHarness(
    translateImpl: (w: string) => Promise<TranslateOutcome> = async () =>
      outcome('আমি ভাত খাই।'),
    injector: FakeTextInjector | null = new FakeTextInjector(),
  ) {
    let generation = 10;
    let enabled = true;
    const settles: Array<[string, string | null]> = [];
    const skips: SkipReason[] = [];
    const coordinator = new ReplacementCoordinator({
      injector,
      translate: async (w) => translateImpl(w),
      isEnabled: () => enabled,
      generation: () => generation,
      setInjecting: () => {},
      guardReleaseMs: 1,
      acceptDelayMs: 1,
      callbacks: {
        onSettled: (word, screenText) => settles.push([word, screenText]),
        onSkipped: (_w, _i, reason) => skips.push(reason),
      },
    });
    return {
      coordinator,
      settles,
      skips,
      gen: () => generation,
      bumpGeneration: () => generation++,
      setEnabled: (v: boolean) => {
        enabled = v;
      },
    };
  }

  it('settles a replaced word with its translation', async () => {
    const h = sentenceHarness(async () => outcome('hola'));
    await h.coordinator.handleCompleted({ word: 'hello', delimiter: ' ' }, h.gen(), 'en', 'es');
    expect(h.settles).toEqual([['hello', 'hola']]);
  });

  it('settles a typed-on word with the word itself', async () => {
    let release!: (o: TranslateOutcome) => void;
    const pending = new Promise<TranslateOutcome>((r) => (release = r));
    const h = sentenceHarness(() => pending);
    const run = h.coordinator.handleCompleted({ word: 'hello', delimiter: ' ' }, h.gen(), 'en', 'es');
    h.bumpGeneration();
    release(outcome('hola'));
    await run;
    expect(h.settles).toEqual([['hello', 'hello']]);
  });

  it('settles with the word itself when translation fails', async () => {
    const h = sentenceHarness(async () => {
      throw new Error('offline');
    });
    await h.coordinator.handleCompleted({ word: 'hello', delimiter: ' ' }, h.gen(), 'en', 'es');
    expect(h.settles).toEqual([['hello', 'hello']]);
  });

  it('settles null when the injector throws mid-swap', async () => {
    const throwing = {
      available: true,
      async replaceWord(): Promise<void> {
        throw new Error('SendInput failed');
      },
    };
    const h = sentenceHarness(async () => outcome('hola'), throwing as FakeTextInjector);
    await h.coordinator.handleCompleted({ word: 'hello', delimiter: ' ' }, h.gen(), 'en', 'es');
    expect(h.settles).toEqual([['hello', null]]);
  });

  it('releases settles in completion order even when a later word finishes first', async () => {
    const injector = new FakeTextInjector();
    let generation = 1;
    let resolveSlow!: (o: TranslateOutcome) => void;
    const settles: Array<[string, string | null]> = [];
    const coordinator = new ReplacementCoordinator({
      injector,
      translate: (w) =>
        w === 'slow'
          ? new Promise<TranslateOutcome>((r) => {
              resolveSlow = r;
            })
          : Promise.resolve(outcome('FAST')),
      isEnabled: () => true,
      generation: () => generation,
      setInjecting: () => {},
      guardReleaseMs: 1,
      acceptDelayMs: 1,
      callbacks: { onSettled: (word, screen) => settles.push([word, screen]) },
    });
    const slowRun = coordinator.handleCompleted({ word: 'slow', delimiter: ' ' }, 1, 'en', 'bn');
    generation = 2;
    await coordinator.handleCompleted({ word: 'fast', delimiter: '.' }, 2, 'en', 'bn');
    // 'fast' fully resolved — it even replaced — but its settle is
    // held behind 'slow', whose translation is still in flight.
    expect(injector.calls).toHaveLength(1);
    expect(settles).toEqual([]);
    resolveSlow(outcome('SLOW'));
    await slowRun;
    // 'slow' lost its generation race by then, so it settles as typed;
    // both settles arrive in the order the words completed.
    expect(settles).toEqual([
      ['slow', 'slow'],
      ['fast', 'FAST'],
    ]);
  });

  it('prepares an offer when the whole-sentence translation differs from the draft', async () => {
    const h = sentenceHarness();
    const offer = await h.coordinator.prepareSentenceOffer(
      'I eat rice.',
      'আমি খাই ভাত.',
      '.',
      'en',
      'bn',
    );
    expect(offer?.inserted).toBe('আমি ভাত খাই।');
    expect(offer?.original).toBe('আমি খাই ভাত.');
  });

  it('prepares a display-only (identical) offer when the translation matches the draft', async () => {
    const h = sentenceHarness(async () => outcome('আমি খাই ভাত.'));
    const offer = await h.coordinator.prepareSentenceOffer(
      'I eat rice.',
      'আমি খাই ভাত.',
      '.',
      'en',
      'bn',
    );
    // The user asked to always see the suggestion: an identical
    // translation still produces an offer, marked display-only.
    expect(offer?.identical).toBe(true);
    expect(offer?.inserted).toBe('আমি খাই ভাত.');
  });

  it("reattaches the user's terminator when the provider drops it", async () => {
    const h = sentenceHarness(async () => outcome('আমি ভাত খাই'));
    const offer = await h.coordinator.prepareSentenceOffer(
      'I eat rice.',
      'আমি খাই ভাত.',
      '.',
      'en',
      'bn',
    );
    expect(offer?.inserted).toBe('আমি ভাত খাই.');
  });

  it('accept swaps the whole span; undo restores the draft sentence', async () => {
    const injector = new FakeTextInjector();
    const h = sentenceHarness(async () => outcome('x'), injector);
    const offer = {
      original: 'আমি খাই ভাত.',
      inserted: 'আমি ভাত খাই।',
      outcome: outcome('আমি ভাত খাই।'),
      terminator: '.',
    };
    await h.coordinator.acceptSentenceOffer(offer, h.gen());
    expect(injector.calls).toEqual([
      { wordLength: 'আমি খাই ভাত.'.length, replacement: 'আমি ভাত খাই।', delimiter: ' ' },
    ]);
    expect(h.coordinator.canUndo).toBe(true);
    await h.coordinator.undoLast();
    expect(injector.calls[1]).toEqual({
      wordLength: 'আমি ভাত খাই।'.length,
      replacement: 'আমি খাই ভাত.',
      delimiter: ' ',
    });
  });

  it('accept of an Enter-ended sentence keeps the newline inside the inserted text', async () => {
    const injector = new FakeTextInjector();
    const h = sentenceHarness(async () => outcome('x'), injector);
    await h.coordinator.acceptSentenceOffer(
      {
        original: 'ভালো সকাল\n',
        inserted: 'Good morning.',
        outcome: outcome('Good morning.'),
        terminator: '\n',
      },
      h.gen(),
    );
    expect(injector.calls).toEqual([
      { wordLength: 'ভালো সকাল\n'.length, replacement: 'Good morning.\n', delimiter: ' ' },
    ]);
  });

  it('accept is skipped when the user typed on after the offer', async () => {
    const injector = new FakeTextInjector();
    const h = sentenceHarness(async () => outcome('x'), injector);
    const atOffer = h.gen();
    h.bumpGeneration();
    await h.coordinator.acceptSentenceOffer(
      {
        original: 'আমি খাই ভাত.',
        inserted: 'আমি ভাত খাই।',
        outcome: outcome('আমি ভাত খাই।'),
        identical: false,
        terminator: '.',
      },
      atOffer,
    );
    expect(injector.calls).toEqual([]);
    expect(h.skips).toContain('typed-on');
  });

  it('accept stands down if the user types during the accept delay', async () => {
    const injector = new FakeTextInjector();
    let generation = 7;
    const skips: SkipReason[] = [];
    const coordinator = new ReplacementCoordinator({
      injector,
      translate: async () => outcome('x'),
      isEnabled: () => true,
      generation: () => generation,
      setInjecting: () => {},
      guardReleaseMs: 1,
      acceptDelayMs: 30,
      callbacks: {
        onSkipped: (_w, _i, reason) => skips.push(reason),
      },
    });
    const run = coordinator.acceptSentenceOffer(
      {
        original: 'আমি খাই ভাত.',
        inserted: 'আমি ভাত খাই।',
        outcome: outcome('আমি ভাত খাই।'),
        identical: false,
        terminator: '.',
      },
      generation,
    );
    generation++; // a keystroke lands while the swap is settling
    await run;
    expect(injector.calls).toEqual([]);
    expect(skips).toContain('typed-on');
  });
});
