/**
 * Sentence tracking for the sentence-offer flow (M7).
 *
 * Word-by-word translation is a live draft: each word is translated
 * alone, so grammar that lives BETWEEN words (verb agreement,
 * prepositions, word order — Bengali puts the verb last) can come out
 * wrong. This tracker remembers the current sentence — the source text
 * exactly as typed AND what each word became on screen — so that when
 * a sentence terminator lands, main can ask the provider for the whole
 * sentence's translation and offer the swap. Memory only, like the
 * word buffer; nothing here touches disk.
 *
 * The tracker is deliberately conservative, mirroring the
 * coordinator's generation guard: any disorder it cannot account for
 * exactly (a backspace into settled text, a replacement that threw
 * mid-swap) marks the sentence broken, and a broken sentence simply
 * never produces an offer. Tracking resumes cleanly at the next
 * sentence.
 *
 * The unsettled region is an ordered segment list: word segments
 * (completed words awaiting their screen fate) interleaved with raw
 * segments (bare delimiters and skipped tokens, which appear on
 * screen exactly as typed). Keystrokes are strictly sequential, so a
 * raw chunk's place in the span is always known — it sits after every
 * segment before it and before everything typed later. (An earlier
 * design voided the sentence when a raw chunk arrived behind an
 * unsettled word; in practice that killed every sentence containing
 * a comma, because the space after the comma lands while the comma's
 * word is still translating.)
 */

export interface SentenceCompletion {
  /** Source sentence as typed, terminator included — except a '\n'
   *  terminator, which is stripped (providers don't need it). */
  sourceText: string;
  /** The sentence as it currently reads on screen, terminator
   *  included: the deletion target if the offer is accepted. */
  screenText: string;
  /** The delimiter that ended the sentence: '.', '!', '?', '।', '॥', '\n'. */
  terminator: string;
}

/** Delimiters that end a sentence (the dandas end Bengali sentences). */
export const SENTENCE_TERMINATORS: ReadonlySet<string> = new Set([
  '.',
  '!',
  '?',
  '।', // । DEVANAGARI DANDA
  '॥', // ॥ DEVANAGARI DOUBLE DANDA
  '\n',
]);

/** Longest sentence (in characters) that earns an offer — parity with
 *  the paste candidate's 300-char cap. */
export const MAX_SENTENCE_CHARS = 300;

const HAS_LETTER = /\p{L}/u;

type Segment =
  | { type: 'word'; word: string; delimiter: string; screen: string | null }
  | { type: 'raw'; text: string };

export class SentenceTracker {
  /** Source/screen text of the sentence's settled (completed) part. */
  private settledSource = '';
  private settledScreen = '';
  /** Raw chars of the chunk currently being typed (not yet a word). */
  private pending = '';
  /** The unsettled region, in typing order: completed words awaiting
   *  their settle, interleaved with verbatim raw chunks. */
  private segments: Segment[] = [];
  /** True once anything unaccountable happened to this sentence. */
  private broken = false;
  /** One loss report per sentence, however it died. */
  private lostReported = false;

  /**
   * @param onLost Diagnostics: fired once when a tracked sentence is
   *  lost (voided or dropped), with the reason and the partial source
   *  text as tracked at that moment. The tracker itself stays silent
   *  in normal operation — main logs these so a missing offer always
   *  has a visible cause.
   */
  constructor(
    private readonly onLost?: (reason: string, partialSource: string) => void,
  ) {}

  /** The sentence as tracked so far, source side (for diagnostics). */
  get partialSource(): string {
    let out = this.settledSource;
    for (const seg of this.segments) {
      out += seg.type === 'word' ? seg.word + seg.delimiter : seg.text;
    }
    return out + this.pending;
  }

  /** True while a partial sentence is being tracked. */
  get hasContent(): boolean {
    return this.settledSource !== '' || this.segments.length > 0 || this.pending !== '';
  }

  private reportLost(reason: string): void {
    if (this.lostReported) return;
    this.lostReported = true;
    this.onLost?.(reason, this.partialSource);
  }

  reset(): void {
    this.settledSource = '';
    this.settledScreen = '';
    this.pending = '';
    this.segments = [];
    this.broken = false;
    this.lostReported = false;
  }

  /** A printable character landed in the document. */
  char(ch: string): void {
    this.pending += ch;
  }

  backspace(): void {
    if (this.pending.length > 0) {
      // Editing the chunk still being typed — always safe, even while
      // earlier words are unsettled (they sit before these chars).
      this.pending = [...this.pending].slice(0, -1).join('');
    } else {
      // Eating a delimiter or settled text: the tracked span no
      // longer matches the screen.
      if (!this.broken) this.reportLost('backspace into the sentence');
      this.broken = true;
    }
  }

  /** WordBuffer completed a word; its screen fate arrives later via
   *  finishWord (the coordinator settles every completion exactly
   *  once, in completion order). */
  beginWord(word: string, delimiter: string): void {
    this.pending = '';
    this.segments.push({ type: 'word', word, delimiter, screen: null });
    if (this.segments.length > 128) {
      this.reportLost('too many pieces to track');
      this.broken = true;
    }
  }

  /**
   * The coordinator settled a completed word. `screenText` is what the
   * word reads as on screen now (its translation, or the word itself
   * when it was left as typed); null means the screen state is
   * unknown (a replacement threw mid-swap) and the sentence is void.
   * Returns the finished sentence when this settle closed one.
   */
  finishWord(word: string, screenText: string | null): SentenceCompletion | null {
    const head = this.segments.find(
      (s): s is Extract<Segment, { type: 'word' }> => s.type === 'word' && s.screen === null,
    );
    if (!head) return null; // settled while untracked (reset, pref off)
    if (head.word !== word || screenText === null) {
      // A settle that does not match the oldest unsettled word, or
      // unknown screen state: void the whole sentence rather than
      // guess at its span.
      this.reportLost(
        screenText === null
          ? 'a replacement failed mid-swap'
          : 'a word settled out of order',
      );
      this.broken = true;
      this.segments = [];
      return null;
    }
    head.screen = screenText;
    return this.emit();
  }

  /**
   * A delimiter that completed no word: a bare punctuation mark (the
   * space after a comma, a doubled space), or the end of a skipped
   * token (a number, an email fragment) whose raw chars are exactly
   * the pending chunk. The chunk's place in the span is always known
   * — it lands after everything before it — so it joins the segment
   * list as raw text and never voids the sentence. Returns the
   * finished sentence when the chunk closed one.
   */
  verbatim(delimiter: string): SentenceCompletion | null {
    const text = this.pending + delimiter;
    this.pending = '';
    this.segments.push({ type: 'raw', text });
    if (this.segments.length > 128) {
      this.reportLost('too many pieces to track');
      this.broken = true;
    }
    return this.emit();
  }

  /**
   * Consume the segment list from the front into the settled text,
   * stopping at the first unsettled word. When a terminator is
   * consumed (a word's delimiter, or a character inside a raw chunk),
   * the sentence is complete; segments behind the terminator belong
   * to the next sentence and survive.
   */
  private emit(): SentenceCompletion | null {
    while (this.segments.length > 0) {
      const seg = this.segments[0];
      if (seg.type === 'word') {
        if (seg.screen === null) return null; // still in flight — wait
        this.segments.shift();
        this.settledSource += seg.word + seg.delimiter;
        this.settledScreen += seg.screen + seg.delimiter;
        if (SENTENCE_TERMINATORS.has(seg.delimiter)) {
          return this.complete(seg.delimiter);
        }
        continue;
      }
      // Raw chunk: scan for a terminator inside it. A '.' right after
      // a digit is a decimal point, not a sentence end ("3.14") —
      // number-final sentences end at their next terminator instead.
      const text = seg.text;
      let prev = this.settledSource.slice(-1);
      let cut = -1;
      let term = '';
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (SENTENCE_TERMINATORS.has(ch) && !(ch === '.' && /\p{Nd}/u.test(prev))) {
          cut = i;
          term = ch;
          break;
        }
        prev = ch;
      }
      this.segments.shift();
      if (cut === -1) {
        this.settledSource += text;
        this.settledScreen += text;
        continue;
      }
      this.settledSource += text.slice(0, cut + 1);
      this.settledScreen += text.slice(0, cut + 1);
      const rest = text.slice(cut + 1);
      if (rest) this.segments.unshift({ type: 'raw', text: rest });
      return this.complete(term);
    }
    return null;
  }

  /** Close out the current sentence and start the next one. Segments
   *  queued behind the terminator and chars already typed belong to
   *  the next sentence and survive; the settled text does not. */
  private complete(terminator: string): SentenceCompletion | null {
    let source = this.settledSource;
    let screen = this.settledScreen;
    const wasBroken = this.broken;
    if (!wasBroken && [...source].length > MAX_SENTENCE_CHARS) {
      this.reportLost('the sentence passed 300 characters');
    }
    this.settledSource = '';
    this.settledScreen = '';
    this.broken = false;
    this.lostReported = false;
    if (wasBroken) return null;
    // Leading whitespace (delimiters typed before the first word) is
    // a separator, not part of the sentence — identical in source and
    // screen because it only ever arrives verbatim.
    const lead = source.match(/^\s+/)?.[0] ?? '';
    if (lead) {
      source = source.slice(lead.length);
      screen = screen.slice(lead.length);
    }
    if (!HAS_LETTER.test(source)) return null;
    if ([...source].length > MAX_SENTENCE_CHARS) return null;
    return {
      sourceText: terminator === '\n' ? source.slice(0, -1) : source,
      screenText: screen,
      terminator,
    };
  }
}

/** Whitespace-insensitive sentence comparison for the differs check. */
export function normalizeSentenceText(text: string): string {
  return text.replace(/\s+/gu, ' ').trim();
}

/** True when the provider's whole-sentence translation actually says
 *  something different from what is on screen — otherwise no offer. */
export function sentenceDiffers(screenText: string, translation: string): boolean {
  return normalizeSentenceText(screenText) !== normalizeSentenceText(translation);
}
