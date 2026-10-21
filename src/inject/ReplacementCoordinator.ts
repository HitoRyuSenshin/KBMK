import type { CompletedWord } from '../hook/WordBuffer';
import { sentenceDiffers } from '../hook/SentenceTracker';
import type { TranslateOutcome } from '../providers/TranslationService';
import { applySourceCase } from '../shared/case';
import { countDeletionUnits } from '../shared/text';
import type { TextInjector } from './TextInjector';

export interface ReplacementInfo {
  word: string;
  /** Final text after case adjustment — what gets (or would get) inserted. */
  inserted: string;
  delimiter: string;
  outcome: TranslateOutcome;
}

/**
 * A prepared paste translation (M5.14). `original`/`inserted` are the
 * bare word (no trailing punctuation); main reattaches the pasted
 * token's punctuation when it composes the final swap.
 */
export interface PasteOffer {
  original: string;
  inserted: string;
  outcome: TranslateOutcome;
}

/**
 * A prepared sentence translation (M7). `original` is the sentence as
 * it currently reads ON SCREEN (the word-by-word draft — the deletion
 * target if the offer is accepted); `inserted` is the provider's
 * whole-sentence translation.
 */
export interface SentenceOffer {
  original: string;
  inserted: string;
  outcome: TranslateOutcome;
  /** True when the whole-sentence translation reads the same as the
   *  draft: main shows it briefly with a ✓ (the user's ask — always
   *  show the suggestion) but never swaps anything for it. */
  identical: boolean;
}

export type SkipReason = 'no-injector' | 'disabled' | 'typed-on' | 'same-text' | 'busy';

export interface CoordinatorCallbacks {
  onTranslating?(word: string): void;
  onTranslated?(info: ReplacementInfo): void;
  onReplaced?(info: ReplacementInfo): void;
  onSkipped?(word: string, inserted: string, reason: SkipReason): void;
  onFailed?(word: string, error: Error): void;
  onUndone?(original: string, inserted: string): void;
  onUndoFailed?(error: Error): void;
  /** Fires exactly once per completed word, with what the word reads
   *  as on screen afterwards (its translation, or the word itself when
   *  left as typed) — the SentenceTracker's settle signal. null means
   *  the screen state is unknown (a replacement threw mid-swap). */
  onSettled?(word: string, screenText: string | null): void;
}

export interface CoordinatorDeps {
  injector: TextInjector | null;
  translate: (word: string, from: string, to: string) => Promise<TranslateOutcome>;
  isEnabled: () => boolean;
  /** Monotonic counter bumped on every key event processed by main. */
  generation: () => number;
  /** While true, the hooks ignore everything (our own injected keys). */
  setInjecting: (value: boolean) => void;
  guardReleaseMs?: number;
  /** Pause before an accepted offer's swap, so the deciding Space is
   *  fully delivered to the document before the backspaces start —
   *  an accepted swap has no translation delay to absorb the race
   *  the way a typed word does. Default 50 ms. */
  acceptDelayMs?: number;
  callbacks?: CoordinatorCallbacks;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Owns the M4 flow: completed word -> translate -> (only if the user
 * has not typed/clicked anything since) replace the word in place.
 *
 * The generation check is the race guard: a translation takes ~150–400
 * ms, and if the user typed the next word meanwhile, replacing would
 * delete *their* new text. In that case the translation is only logged.
 */
export class ReplacementCoordinator {
  private readonly deps: CoordinatorDeps;
  private last: { original: string; inserted: string; delimiter: string } | null = null;
  private busy = false;
  /**
   * Settle signals are released strictly in handleCompleted call
   * order. Translations finish out of order — a cached word beats a
   * slow one, a skip resolves instantly — but the sentence tracker
   * models the sentence in the order its words completed, so each
   * call reserves a slot up front and slots flush in order.
   */
  private settleSlots: Array<{
    word: string;
    ready: boolean;
    screenText: string | null;
  }> = [];

  constructor(deps: CoordinatorDeps) {
    this.deps = deps;
  }

  private reserveSettle(word: string): (screenText: string | null) => void {
    const slot = { word, ready: false, screenText: null as string | null };
    this.settleSlots.push(slot);
    let used = false;
    return (screenText: string | null) => {
      if (used) return; // exactly one settle per completion
      used = true;
      slot.ready = true;
      slot.screenText = screenText;
      this.flushSettles();
    };
  }

  private flushSettles(): void {
    const onSettled = this.deps.callbacks?.onSettled;
    while (this.settleSlots.length > 0 && this.settleSlots[0].ready) {
      const slot = this.settleSlots.shift()!;
      onSettled?.(slot.word, slot.screenText);
    }
  }

  /** True when an undo is currently available (for tests/diagnostics). */
  get canUndo(): boolean {
    return this.last !== null;
  }

  async handleCompleted(
    done: CompletedWord,
    generationAtCompletion: number,
    source: string,
    target: string,
  ): Promise<void> {
    const cb = this.deps.callbacks ?? {};
    cb.onTranslating?.(done.word);
    /** The SentenceTracker settle signal: exactly one call per word,
     *  released in completion order (see settleSlots). */
    const settle = this.reserveSettle(done.word);
    let outcome: TranslateOutcome;
    try {
      outcome = await this.deps.translate(done.word, source, target);
    } catch (error) {
      cb.onFailed?.(done.word, error as Error);
      settle(done.word); // left as typed
      return;
    }
    const inserted = applySourceCase(done.word, outcome.text);
    const info: ReplacementInfo = {
      word: done.word,
      inserted,
      delimiter: done.delimiter,
      outcome,
    };
    cb.onTranslated?.(info);

    const injector = this.deps.injector;
    if (!injector || !injector.available) {
      cb.onSkipped?.(done.word, inserted, 'no-injector');
      settle(done.word);
      return;
    }
    if (this.busy) {
      cb.onSkipped?.(done.word, inserted, 'busy');
      settle(done.word);
      return;
    }
    if (!this.deps.isEnabled()) {
      cb.onSkipped?.(done.word, inserted, 'disabled');
      settle(done.word);
      return;
    }
    if (this.deps.generation() !== generationAtCompletion) {
      cb.onSkipped?.(done.word, inserted, 'typed-on');
      settle(done.word);
      return;
    }
    if (inserted === done.word) {
      cb.onSkipped?.(done.word, inserted, 'same-text');
      settle(done.word);
      return;
    }

    this.busy = true;
    try {
      await this.guarded(() =>
        injector.replaceWord(countDeletionUnits(done.word), inserted, done.delimiter),
      );
      this.last = { original: done.word, inserted, delimiter: done.delimiter };
      cb.onReplaced?.(info);
      settle(inserted);
    } catch (error) {
      cb.onFailed?.(done.word, error as Error);
      settle(null); // the swap may have half-landed; screen state unknown
    } finally {
      this.busy = false;
    }
  }

  /**
   * Paste offers (M5.14): translate a pasted word BEFORE the user
   * decides, so the pill can show "pasted → translation". Nothing is
   * replaced here. Returns null when there is nothing worth offering
   * (translation failed, or the word already reads as its translation).
   */
  async preparePasteOffer(
    word: string,
    source: string,
    target: string,
  ): Promise<PasteOffer | null> {
    const cb = this.deps.callbacks ?? {};
    let outcome: TranslateOutcome;
    try {
      outcome = await this.deps.translate(word, source, target);
    } catch (error) {
      cb.onFailed?.(word, error as Error);
      return null;
    }
    const inserted = applySourceCase(word, outcome.text);
    cb.onTranslated?.({ word, inserted, delimiter: ' ', outcome });
    if (inserted === word) return null;
    return { original: word, inserted, outcome };
  }

  /**
   * The user pressed Space to accept a paste offer: swap the pasted
   * text for its translation. The accepting Space has just landed in
   * the document, so mechanically this is a completed word whose
   * delimiter is ' '. Same guards as the typed flow; the accepted
   * swap is undoable with Ctrl+Alt+Z like any other.
   */
  async acceptPasteOffer(
    offer: PasteOffer & { originalToken: string; suffix: string },
    generationAtAccept: number,
  ): Promise<void> {
    const cb = this.deps.callbacks ?? {};
    const info: ReplacementInfo = {
      word: offer.originalToken,
      inserted: offer.inserted + offer.suffix,
      delimiter: ' ',
      outcome: offer.outcome,
    };
    const injector = this.deps.injector;
    if (!injector || !injector.available) {
      cb.onSkipped?.(info.word, info.inserted, 'no-injector');
      return;
    }
    if (this.busy) {
      cb.onSkipped?.(info.word, info.inserted, 'busy');
      return;
    }
    if (!this.deps.isEnabled()) {
      cb.onSkipped?.(info.word, info.inserted, 'disabled');
      return;
    }
    if (this.deps.generation() !== generationAtAccept) {
      cb.onSkipped?.(info.word, info.inserted, 'typed-on');
      return;
    }
    // Let the accepting Space land in the document before deleting
    // over it; if the user typed on during the pause, stand down.
    await sleep(this.deps.acceptDelayMs ?? 50);
    if (this.deps.generation() !== generationAtAccept) {
      cb.onSkipped?.(info.word, info.inserted, 'typed-on');
      return;
    }
    if (this.busy) {
      cb.onSkipped?.(info.word, info.inserted, 'busy');
      return;
    }
    this.busy = true;
    try {
      await this.guarded(() =>
        injector.replaceWord(countDeletionUnits(offer.originalToken), info.inserted, ' '),
      );
      this.last = { original: offer.originalToken, inserted: info.inserted, delimiter: ' ' };
      cb.onReplaced?.(info);
    } catch (error) {
      cb.onFailed?.(info.word, error as Error);
    } finally {
      this.busy = false;
    }
  }

  /**
   * Sentence offers (M7): translate a FINISHED sentence as a whole —
   * the way a pasted sentence is translated — so grammar and word
   * order come out right, unlike the word-by-word draft on screen.
   * Nothing is replaced here. Returns null when the translation
   * failed or the whole-sentence version reads the same as the draft.
   */
  async prepareSentenceOffer(
    sourceText: string,
    screenText: string,
    terminator: string,
    source: string,
    target: string,
  ): Promise<SentenceOffer | null> {
    const cb = this.deps.callbacks ?? {};
    let outcome: TranslateOutcome;
    try {
      outcome = await this.deps.translate(sourceText, source, target);
    } catch (error) {
      cb.onFailed?.(sourceText, error as Error);
      return null;
    }
    let inserted = outcome.text;
    // A provider that drops the closing punctuation shouldn't cost
    // the user theirs: reattach the terminator they typed.
    if (
      terminator !== '\n' &&
      !/[.!?।॥]$/.test(inserted.trimEnd()) &&
      /[.!?।॥]$/.test(screenText.trimEnd())
    ) {
      inserted = inserted.trimEnd() + screenText.trimEnd().slice(-1);
    }
    const identical = !sentenceDiffers(screenText, inserted);
    return { original: screenText, inserted, outcome, identical };
  }

  /**
   * The user pressed Space to accept a sentence offer: swap the
   * on-screen draft sentence for the whole-sentence translation. The
   * accepting Space has just landed in the document, so mechanically
   * this is a completed word whose delimiter is ' ' — the span deleted
   * is the whole draft sentence (terminator included), and for an
   * Enter-ended sentence the newline rides along inside the inserted
   * text so the line break survives the swap. Undoable with
   * Ctrl+Alt+Z like any other replacement: undo restores the draft.
   */
  async acceptSentenceOffer(
    offer: SentenceOffer & { terminator: string },
    generationAtAccept: number,
  ): Promise<void> {
    const cb = this.deps.callbacks ?? {};
    const inserted =
      offer.terminator === '\n' ? offer.inserted + '\n' : offer.inserted;
    const info: ReplacementInfo = {
      word: offer.original,
      inserted,
      delimiter: ' ',
      outcome: offer.outcome,
    };
    const injector = this.deps.injector;
    if (!injector || !injector.available) {
      cb.onSkipped?.(info.word, info.inserted, 'no-injector');
      return;
    }
    if (this.busy) {
      cb.onSkipped?.(info.word, info.inserted, 'busy');
      return;
    }
    if (!this.deps.isEnabled()) {
      cb.onSkipped?.(info.word, info.inserted, 'disabled');
      return;
    }
    if (this.deps.generation() !== generationAtAccept) {
      cb.onSkipped?.(info.word, info.inserted, 'typed-on');
      return;
    }
    // Let the accepting Space land in the document before deleting
    // over it; if the user typed on during the pause, stand down.
    await sleep(this.deps.acceptDelayMs ?? 50);
    if (this.deps.generation() !== generationAtAccept) {
      cb.onSkipped?.(info.word, info.inserted, 'typed-on');
      return;
    }
    if (this.busy) {
      cb.onSkipped?.(info.word, info.inserted, 'busy');
      return;
    }
    this.busy = true;
    try {
      await this.guarded(() =>
        injector.replaceWord(countDeletionUnits(offer.original), inserted, ' '),
      );
      this.last = { original: offer.original, inserted, delimiter: ' ' };
      cb.onReplaced?.(info);
    } catch (error) {
      cb.onFailed?.(info.word, error as Error);
    } finally {
      this.busy = false;
    }
  }

  /** Ctrl+Alt+Z: restore the original word of the last replacement. */
  async undoLast(): Promise<void> {    const cb = this.deps.callbacks ?? {};
    const injector = this.deps.injector;
    if (!this.last || this.busy || !injector || !injector.available) return;
    const entry = this.last;
    this.last = null;
    this.busy = true;
    try {
      await this.guarded(() =>
        injector.replaceWord(countDeletionUnits(entry.inserted), entry.original, entry.delimiter),
      );
      cb.onUndone?.(entry.original, entry.inserted);
    } catch (error) {
      this.last = entry; // let the user try again
      cb.onUndoFailed?.(error as Error);
    } finally {
      this.busy = false;
    }
  }

  /** Hold the injection guard for the edit plus a short tail, so any
   *  straggler synthetic events are still ignored by the hooks. */
  private async guarded(action: () => Promise<void>): Promise<void> {
    this.deps.setInjecting(true);
    try {
      await action();
    } finally {
      const releaseMs = this.deps.guardReleaseMs ?? 50;
      setTimeout(() => this.deps.setInjecting(false), releaseMs);
    }
  }
}
