import { BrowserWindow, app, clipboard, ipcMain, screen } from 'electron';
import { join } from 'node:path';
import { DEFAULT_STATE, IPC, normalizeProviderKind, type AppState } from '../shared/types';
import { withEnabled, withLanguages, withSwap } from '../shared/state';
import { createTray } from './tray';
import { openSettingsWindow } from './settingsWindow';
import { WordBuffer, codePointsOf, delimiterLabel } from '../hook/WordBuffer';
import { SentenceTracker, type SentenceCompletion } from '../hook/SentenceTracker';
import { UiohookKeyHook } from '../hook/UiohookKeyHook';
import { Win32LayoutKeyHook } from '../hook/Win32LayoutKeyHook';
import type { KeyEventLike, KeyHook } from '../hook/KeyHook';
import Store from 'electron-store';
import {
  ElectronStoreKeyValueStore,
  MemoryKeyValueStore,
  type KeyValueStore,
} from '../profiles/KeyValueStore';
import { KeytarSecretStore } from '../profiles/SecretStore';
import { ProfileStore } from '../profiles/ProfileStore';
import { ProfileRouter } from '../profiles/ProfileRouter';
import { TranslationService } from '../providers/TranslationService';
import { usageTextFor } from '../shared/usage';
import { secretStoreFixHint, secretStoreName } from '../shared/secretStoreInfo';
import {
  expandDirectionFor,
  pillAnchorY,
  rightAnchoredX,
  windowYFor,
  type ExpandDirection,
} from '../shared/expand';
import { LanguageListService } from '../providers/LanguageListService';
import { TranslationError } from '../providers/errors';
import { ReplacementCoordinator } from '../inject/ReplacementCoordinator';
import type { TranslateOutcome } from '../providers/TranslationService';
import { extractPasteCandidate, type PasteCandidate } from '../hook/pasteCandidate';
import { DEFAULT_ACCENT } from '../shared/color';
import { createMousePasteTracker } from '../hook/mousePaste';
import { WindowsTextInjector } from '../inject/WindowsTextInjector';
import { LinuxTextInjector } from '../inject/LinuxTextInjector';
import type { TextInjector } from '../inject/TextInjector';
import { PreferencesStore } from '../settings/PreferencesStore';
import { ForegroundAppTracker } from './foregroundApp';
import { listOpenWindows } from './openWindows';
import type { PreferencesView } from '../shared/types';

const PILL_WIDTH = 384;
const PILL_HEIGHT = 56;
const EXPANDED_HEIGHT = 344;
const EDGE_MARGIN = 16;
/** Widest the pill window ever gets (the language menu's width). */
const MENU_WIDTH = PILL_WIDTH;
/** Narrowest the content-hugging pill may shrink to (M5.13). */
const MIN_PILL_WIDTH = 264;
/** The pill's natural content width, measured by the renderer (M5.13). */
let contentPillWidth = PILL_WIDTH;

let pillWindow: BrowserWindow | null = null;
let state: AppState = { ...DEFAULT_STATE };
let expanded = false;
/** Which way pill content (menu/toast) currently opens (M5.11). */
let expandDirection: ExpandDirection = 'above';

/* M2: global hook + word buffer. Completed words are logged to the dev
   console (the terminal running `npm start`) only — keystrokes are never
   logged individually, and nothing is ever written to disk. */
const wordBuffer = new WordBuffer();
/* M7: the current sentence, tracked beside the word buffer so a
   finished sentence can be offered as a whole-sentence translation.
   `sentenceOffersEnabled` mirrors the Settings toggle (default on). */
const sentenceTracker = new SentenceTracker((reason, partial) => {
  const clip = partial.length > 80 ? `${partial.slice(0, 80)}…` : partial;
  console.log(`[KBMK] sentence tracking lost: ${reason} — was: "${clip}"`);
});

/** Reset the tracker for an external interruption, narrating the
 *  loss when a partial sentence was being tracked — a missing offer
 *  should always have a visible cause in the log. */
function dropSentenceTracking(reason: string): void {
  if (sentenceTracker.hasContent) {
    const partial = sentenceTracker.partialSource;
    const clip = partial.length > 80 ? `${partial.slice(0, 80)}…` : partial;
    console.log(`[KBMK] sentence tracking dropped (${reason}) — was: "${clip}"`);
  }
  sentenceTracker.reset();
}
let sentenceOffersEnabled = true;
let keyHook: KeyHook | null = null;
/** Every live hook, so the injection guard can silence all of them. */
const allHooks: KeyHook[] = [];
/** Bumped on every processed key event; translations compare their
 *  completion-time value so a replacement never fires after the user
 *  has already typed on (see ReplacementCoordinator). */
let editGeneration = 0;

/* M3: key profiles + translation service. Secrets live only in keytar;
   metadata in electron-store; the renderer sees safe views only. */
let profileStore: ProfileStore | null = null;
let profileRouter: ProfileRouter | null = null;
let translationService: TranslationService | null = null;
let languageListService: LanguageListService | null = null;
let lastGuidanceNoticeAt = 0;

function setupProfilesAndTranslation(): void {
  let kv: KeyValueStore;
  try {
    const store = new Store({ name: 'kbmk-settings' });
    kv = new ElectronStoreKeyValueStore(
      store as unknown as {
        get(key: string): unknown;
        set(key: string, value: unknown): void;
        delete(key: string): void;
      },
    );
  } catch {
    kv = new MemoryKeyValueStore();
    console.log(
      '[KBMK] Settings store unavailable; key profiles will not persist this session.',
    );
  }
  profileStore = new ProfileStore(kv, new KeytarSecretStore());
  profileRouter = new ProfileRouter({
    store: profileStore,
    onSwitched: (toLabel) => {
      setState({
        ...state,
        notice: `Switched to ${toLabel}'s key`,
        noticeSeq: state.noticeSeq + 1,
      });
    },
  });
  translationService = new TranslationService((text, from, to) =>
    profileRouter!.attempt(text, from, to),
  );
  languageListService = new LanguageListService(kv, () =>
    profileRouter!.listSupportedLanguages(),
  );
  preferencesStore = new PreferencesStore(kv);
  sentenceOffersEnabled = preferencesStore.sentenceOffers();
  blockSet = new Set(preferencesStore.blockList());
  console.log(
    `[KBMK] block list (${blockSet.size}): ${[...blockSet].join(', ') || '(empty)'}`,
  );
  setState({
    ...state,
    accent: preferencesStore.accent(),
    opacity: preferencesStore.glassOpacity(),
  });
  if (!profileStore.keyStoreAvailable) {
    console.log(
      `[KBMK] Secure key storage (${secretStoreName(process.platform)} via keytar) is unavailable, ` +
        `so API keys cannot be added. ${secretStoreFixHint(process.platform)} ` +
        'The experimental keyless provider still works.',
    );
  }
}

/* M5: preferences (block list) + foreground-app tracking. In a
   blocked app nothing is captured, translated, or replaced. */
let preferencesStore: PreferencesStore | null = null;
let foregroundTracker: ForegroundAppTracker | null = null;
let blockSet = new Set<string>();
let lastForegroundApp: string | null = null;

function foregroundBlocked(): boolean {
  return lastForegroundApp !== null && blockSet.has(lastForegroundApp);
}

/* M4: in-place replacement. The coordinator translates a completed
   word and, if the user hasn't typed on meanwhile, swaps it in place
   via the TextInjector. Ctrl+Alt+Z undoes the last swap. */
let textInjector: TextInjector | null = null;
let coordinator: ReplacementCoordinator | null = null;

function setupReplacement(): void {
  if (process.platform === 'win32') {
    const injector = new WindowsTextInjector();
    textInjector = injector.available ? injector : null;
    console.log(
      injector.available
        ? '[KBMK] Text replacement: active (SendInput). Ctrl+Alt+Z undoes the last replacement.'
        : '[KBMK] Text replacement: unavailable (SendInput could not load) — translations will only be logged.',
    );
  } else if (process.platform === 'linux') {
    const injector = new LinuxTextInjector();
    textInjector = injector.available ? injector : null;
    console.log(
      injector.available
        ? `[KBMK] Text replacement: active (XTest). Ctrl+Alt+Z undoes the last replacement.${injector.sessionNote ? ` ${injector.sessionNote}` : ''}`
        : `[KBMK] Text replacement: unavailable (${injector.unavailableReason ?? 'unknown reason'}) — translations will only be logged.`,
    );
  }
  coordinator = new ReplacementCoordinator({
    injector: textInjector,
    translate: (word, from, to) => translationService!.translate(word, from, to),
    isEnabled: () => state.enabled && !foregroundBlocked(),
    generation: () => editGeneration,
    setInjecting: (value) => {
      for (const hook of allHooks) hook.setInjecting(value);
    },
    callbacks: {
      onTranslating: () => {
        if (state.enabled) setState({ ...state, status: 'Fetching' });
      },
      onTranslated: (info) => {
        const outcome = info.outcome;
        const via = outcome.cached
          ? 'cached'
          : `${outcome.providerId}${outcome.profileLabel ? `, key "${outcome.profileLabel}"` : ''}${
              outcome.switchedFromLabel ? `, switched from "${outcome.switchedFromLabel}"` : ''
            }`;
        console.log(
          `[KBMK] "${info.word}" -> "${info.inserted}" (${via}, ${outcome.durationMs} ms)`,
        );
        if (state.enabled) {
          setState({ ...state, status: outcome.cached ? 'Cached' : 'Ready' });
        }
      },
      onReplaced: (info) => {
        console.log(`[KBMK] replaced in text: "${info.word}" => "${info.inserted}"`);
      },
      onSkipped: (word, inserted, reason) => {
        if (reason === 'typed-on') {
          console.log(
            `[KBMK] not replaced ("${word}"): you kept typing — translation was "${inserted}"`,
          );
        } else if (reason === 'same-text') {
          console.log(`[KBMK] "${word}" already reads as its translation; left as typed`);
        }
        // 'no-injector' | 'disabled' | 'busy': the M3-style log line above is enough.
      },
      onFailed: (word, error) => {
        const kind = error instanceof TranslationError ? error.kind : 'unknown';
        if (kind === 'no-profile') {
          console.log(`[KBMK] translate skipped for "${word}": ${error.message}`);
          const nowMs = Date.now();
          if (nowMs - lastGuidanceNoticeAt > 30_000) {
            lastGuidanceNoticeAt = nowMs;
            setState({
              ...state,
              notice: 'Add an API key in Settings, or use the keyless provider',
              noticeSeq: state.noticeSeq + 1,
            });
          }
        } else {
          console.log(
            `[KBMK] translation failed for "${word}": ${error.message} — word left as typed`,
          );
        }
        if (state.enabled) {
          setState({
            ...state,
            status: kind === 'network' || kind === 'timeout' ? 'Offline' : 'Ready',
          });
        }
      },
      onUndone: (original, inserted) => {
        console.log(`[KBMK] undo: "${inserted}" => "${original}" restored`);
      },
      onUndoFailed: (error) => {
        console.log(`[KBMK] undo failed: ${error.message}`);
      },
      onSettled: (word, screenText) => {
        const completion = sentenceTracker.finishWord(word, screenText);
        if (completion) onSentenceCompleted(completion);
      },
    },
  });
}

/* M5.14: paste-translation offers. Pasted text never passes through
   the word buffer, so a Ctrl+V of a single word gets its own flow:
   translate immediately, show "pasted → translation" above the pill,
   Space accepts the swap, Alt+Space (or doing anything else) keeps
   the pasted word. */
interface PendingPasteOffer {
  /** The full pasted token as it sits in the document (word + suffix). */
  originalToken: string;
  /** The bare translation, before the token's punctuation is reattached. */
  bareInserted: string;
  suffix: string;
  outcome: TranslateOutcome;
  /** editGeneration at the paste; any later activity retires the offer. */
  generation: number;
}
let pasteOffer: PendingPasteOffer | null = null;
let pasteOfferTimer: ReturnType<typeof setTimeout> | null = null;
const PASTE_OFFER_TTL_MS = 15_000;

function setHooksOfferPending(value: boolean): void {
  for (const hook of allHooks) hook.setOfferPending?.(value);
}

function clearPasteOffer(reason: string): void {
  if (!pasteOffer) return;
  pasteOffer = null;
  if (pasteOfferTimer) {
    clearTimeout(pasteOfferTimer);
    pasteOfferTimer = null;
  }
  setHooksOfferPending(false);
  console.log(`[KBMK] paste offer: ${reason}`);
  if (state.pasteOffer) setState({ ...state, pasteOffer: null });
}

function showPasteOffer(pending: PendingPasteOffer, ttlMs: number = PASTE_OFFER_TTL_MS): void {
  pasteOffer = pending;
  setHooksOfferPending(true);
  setState({
    ...state,
    pasteOffer: {
      original: pending.originalToken,
      inserted: pending.bareInserted + pending.suffix,
    },
  });
  console.log(
    `[KBMK] paste offer: "${pending.originalToken}" -> "${pending.bareInserted + pending.suffix}" ` +
      '(Space = replace, Esc = keep)',
  );
  // Proof of growth for the terminal log: if the window did not reach
  // the offer height, the popup exists but is clipped — this line
  // tells us which (M5.15 diagnostics).
  setTimeout(() => {
    const b = pillWindow?.getBounds();
    if (b) console.log(`[KBMK] paste offer on screen; pill window is ${b.width}x${b.height}`);
  }, 400);
  pasteOfferTimer = setTimeout(() => {
    if (pasteOffer === pending) clearPasteOffer(`expired after ${Math.round(ttlMs / 1000)}s`);
  }, ttlMs);
}

/** Translate a candidate and, if the user hasn't moved on, show its
 *  offer. Shared by the keyboard-paste and mouse-paste paths. The
 *  deletion target is the candidate's RAW text — exactly what the
 *  paste put in the document, surrounding spaces included. */
function prepareAndShowOffer(candidate: PasteCandidate, ttlMs: number): void {
  if (!coordinator) return;
  const generation = editGeneration;
  void coordinator
    .preparePasteOffer(candidate.word, state.source, state.target)
    .then((offer) => {
      if (!offer) return;
      if (editGeneration !== generation) return; // the user has moved on
      if (!state.enabled || foregroundBlocked()) return;
      showPasteOffer(
        {
          originalToken: candidate.raw,
          bareInserted: offer.inserted,
          suffix: candidate.suffix,
          outcome: offer.outcome,
          generation,
        },
        ttlMs,
      );
    });
}

function startPasteOffer(): void {
  clearPasteOffer('superseded by a new paste');
  if (!coordinator || !textInjector?.available) return;
  const raw = clipboard.readText();
  const candidate = extractPasteCandidate(raw);
  if (!candidate) {
    if (raw.trim()) {
      console.log(
        `[KBMK] paste: no offer — the clipboard (${raw.trim().length} chars) is not one line of prose`,
      );
    }
    return;
  }
  prepareAndShowOffer(candidate, PASTE_OFFER_TTL_MS);
}

/* M5.16: mouse paste (right-click → Paste). The keyboard hook cannot
   see a context-menu pick, so main watches the gesture: a right press
   snapshots the clipboard; a nearby left press within ~2.5s is a menu
   pick, and if the clipboard is UNCHANGED by it, the pick was Paste
   (Copy/Cut would have changed it). Heuristic by design — the same
   Space/Esc offer follows, with a shorter 10s life. */
const mousePasteTracker = createMousePasteTracker();
let clipboardAtRightClick: string | null = null;
const MOUSE_PASTE_TTL_MS = 10_000;

function handleMousePasteGesture(event: KeyEventLike): void {
  const mouse = event.mouse;
  if (!mouse) return;
  if (mouse.button === 2) {
    mousePasteTracker.rightDown(mouse.x, mouse.y, Date.now());
    clipboardAtRightClick = clipboard.readText();
    return;
  }
  if (mouse.button !== 1) return;
  if (!mousePasteTracker.leftDown(mouse.x, mouse.y, Date.now())) return;
  const before = clipboardAtRightClick;
  clipboardAtRightClick = null;
  if (before === null || clipboard.readText() !== before) return; // Copy/Cut/other — no offer
  const candidate = extractPasteCandidate(before);
  if (!candidate || !coordinator || !textInjector?.available) return;
  console.log('[KBMK] mouse paste detected (clipboard unchanged across the context menu)');
  prepareAndShowOffer(candidate, MOUSE_PASTE_TTL_MS);
}

/* M7: sentence offers. Word-by-word translation is a live draft —
   grammar that lives between words (agreement, prepositions, word
   order) can come out wrong. When the SentenceTracker reports a
   finished sentence, the provider translates the WHOLE sentence and,
   if that reads differently from the draft on screen, the pill
   offers the swap: Space accepts, Esc keeps the draft. Same offer
   discipline as paste offers — one at a time, generation-guarded,
   never silent. */
interface PendingSentenceOffer {
  /** The sentence as it reads on screen (the deletion target). */
  screenText: string;
  /** The whole-sentence translation. */
  inserted: string;
  /** True when the translation matches the draft: display-only
   *  (shown with a ✓, never intercepts a key, shorter TTL). */
  identical: boolean;
  terminator: string;
  outcome: TranslateOutcome;
  /** editGeneration when the sentence completed; acceptance needs
   *  the deciding Space to be the very next activity. */
  generation: number;
  source: string;
  target: string;
}
let sentenceOffer: PendingSentenceOffer | null = null;
let sentenceOfferTimer: ReturnType<typeof setTimeout> | null = null;
const SENTENCE_OFFER_TTL_MS = 15_000;
/** A reads-well (identical) offer is just a confirmation: brief. */
const SENTENCE_IDENTICAL_TTL_MS = 4_000;

function clearSentenceOffer(reason: string): void {
  if (!sentenceOffer) return;
  sentenceOffer = null;
  if (sentenceOfferTimer) {
    clearTimeout(sentenceOfferTimer);
    sentenceOfferTimer = null;
  }
  if (!pasteOffer) setHooksOfferPending(false);
  console.log(`[KBMK] sentence offer: ${reason}`);
  if (state.sentenceOffer) setState({ ...state, sentenceOffer: null });
}

function showSentenceOffer(pending: PendingSentenceOffer): void {
  sentenceOffer = pending;
  setHooksOfferPending(true);
  setState({
    ...state,
    sentenceOffer: {
      original: pending.screenText,
      inserted: pending.inserted,
      identical: pending.identical,
    },
  });
  const clip = (s: string) => (s.length > 120 ? `${s.slice(0, 120)}…` : s);
  const ttl = pending.identical ? SENTENCE_IDENTICAL_TTL_MS : SENTENCE_OFFER_TTL_MS;
  if (pending.identical) {
    console.log(
      `[KBMK] sentence offer: "${clip(pending.inserted)}" — already reads well, shown briefly (no swap)`,
    );
  } else {
    console.log(
      `[KBMK] sentence offer: "${clip(pending.screenText)}" -> "${clip(pending.inserted)}" ` +
        '(Space = replace, Esc = keep)',
    );
  }
  sentenceOfferTimer = setTimeout(() => {
    if (sentenceOffer === pending) {
      clearSentenceOffer(`expired after ${Math.round(ttl / 1000)}s`);
    }
  }, ttl);
}

/** The tracker closed a sentence: fetch its whole-sentence
 *  translation and offer the swap when it improves on the draft. */
function onSentenceCompleted(completion: SentenceCompletion): void {
  const clip = (s: string) => (s.length > 80 ? `${s.slice(0, 80)}…` : s);
  if (!sentenceOffersEnabled || !coordinator || !textInjector?.available) {
    console.log('[KBMK] sentence offer skipped: offers off or no text injector');
    return;
  }
  if (pasteOffer || sentenceOffer) {
    console.log('[KBMK] sentence offer skipped: another offer is already showing');
    return; // one offer at a time
  }
  if (!state.enabled || foregroundBlocked()) {
    console.log('[KBMK] sentence offer skipped: paused or a blocked app is in front');
    return;
  }
  console.log(
    `[KBMK] sentence complete: "${clip(completion.sourceText)}" — fetching its translation`,
  );
  const generation = editGeneration;
  const source = state.source;
  const target = state.target;
  void coordinator
    .prepareSentenceOffer(
      completion.sourceText,
      completion.screenText,
      completion.terminator,
      source,
      target,
    )
    .then((offer) => {
      if (!offer) return; // translation failed — already logged by onFailed
      if (editGeneration !== generation) {
        console.log('[KBMK] sentence offer dropped: you typed on while it was fetching');
        return;
      }
      if (!state.enabled || foregroundBlocked()) {
        console.log('[KBMK] sentence offer dropped: paused or blocked meanwhile');
        return;
      }
      if (pasteOffer || sentenceOffer) {
        console.log('[KBMK] sentence offer dropped: another offer took the slot');
        return;
      }
      if (state.source !== source || state.target !== target) {
        console.log('[KBMK] sentence offer dropped: the language pair changed');
        return;
      }
      showSentenceOffer({
        screenText: completion.screenText,
        inserted: offer.inserted,
        identical: offer.identical,
        terminator: completion.terminator,
        outcome: offer.outcome,
        generation,
        source,
        target,
      });
    });
}

function startHook(): void {
  // Opt-in diagnostics for input-method bugs (e.g. Bengali IME/Avro keys):
  // KBMK_DEBUG_KEYS=1 prints the raw keycode of every keydown to this
  // terminal. Off by default; keystrokes are never logged in normal runs.
  const debugKeys = process.env.KBMK_DEBUG_KEYS === '1';
  if (debugKeys) {
    console.log(
      '[KBMK-DEBUG] Raw keycode logging ON (KBMK_DEBUG_KEYS=1). ' +
        'Turn it off by starting without that variable.',
    );
  }
  const feed = (event: KeyEventLike) => {
    // Hotkeys first: Ctrl+Alt+T must also work while paused, or there
    // would be no way back without reaching for the mouse.
    if (event.type === 'hotkey') {
      editGeneration++;
      wordBuffer.reset();
      dropSentenceTracking('a hotkey was pressed');
      if (event.hotkey === 'dismiss-paste') {
        clearPasteOffer('dismissed (Esc) — pasted word kept');
        clearSentenceOffer('dismissed (Esc) — sentence kept as typed');
        return;
      }
      clearPasteOffer('cleared by a hotkey');
      clearSentenceOffer('cleared by a hotkey');
      if (event.hotkey === 'toggle') {
        const next = !state.enabled;
        setState({
          ...withEnabled(state, next),
          notice: next ? 'KBMK is ON' : 'KBMK paused — Ctrl+Alt+T to resume',
          noticeSeq: state.noticeSeq + 1,
        });
        console.log(`[KBMK] ${next ? 'resumed' : 'paused'} via Ctrl+Alt+T`);
      } else if (event.hotkey === 'undo' && state.enabled && !foregroundBlocked()) {
        void coordinator?.undoLast();
      }
      return;
    }
    if (!state.enabled) return; // Paused: every key passes through untouched.

    // Block list (M5): know which app is in front. A change of app
    // abandons the current word (and bumps the generation, so a
    // translation already in flight can no longer land anywhere).
    const appName = foregroundTracker?.currentApp() ?? null;
    if (appName !== lastForegroundApp) {
      lastForegroundApp = appName;
      editGeneration++;
      wordBuffer.reset();
      dropSentenceTracking('the app changed');
      if (appName) console.log(`[KBMK] foreground app: ${appName}`);
      if (appName && blockSet.has(appName)) {
        setState({
          ...state,
          notice: `KBMK is off in ${appName} (block list)`,
          noticeSeq: state.noticeSeq + 1,
        });
        console.log(`[KBMK] blocked app in focus: ${appName} — nothing is captured`);
      }
    }
    if (appName && blockSet.has(appName)) return; // never buffered, never sent anywhere

    // Paste (M5.14): the pasted text itself never reaches the buffer;
    // a single pasted word starts the offer flow instead.
    if (event.type === 'paste') {
      editGeneration++;
      wordBuffer.reset();
      dropSentenceTracking('a paste started');
      clearSentenceOffer('superseded by a paste');
      startPasteOffer();
      return;
    }

    editGeneration++;
    // A pending offer meets its decision point: Space accepts — but
    // only if literally nothing else happened since the offer. Any
    // other activity retires the offer, and the key is then processed
    // exactly as usual. An accepted swap rewrites the document under
    // the sentence tracker, so the tracker restarts from the swap and
    // this Space is not fed to it (the swap re-emits it).
    let skipTrackerFeed = false;
    if (pasteOffer) {
      if (
        event.type === 'delimiter' &&
        event.char === ' ' &&
        pasteOffer.generation === editGeneration - 1
      ) {
        const pending = pasteOffer;
        clearPasteOffer(`accepted (Space) — foreground app: ${lastForegroundApp ?? 'unknown'}`);
        sentenceTracker.reset();
        skipTrackerFeed = true;
        void coordinator?.acceptPasteOffer(
          {
            original: pending.originalToken,
            inserted: pending.bareInserted,
            outcome: pending.outcome,
            originalToken: pending.originalToken,
            suffix: pending.suffix,
          },
          editGeneration,
        );
      } else {
        clearPasteOffer('cleared — the user did something else first');
      }
    } else if (sentenceOffer) {
      if (
        !sentenceOffer.identical &&
        event.type === 'delimiter' &&
        event.char === ' ' &&
        sentenceOffer.generation === editGeneration - 1
      ) {
        const pending = sentenceOffer;
        clearSentenceOffer(`accepted (Space) — foreground app: ${lastForegroundApp ?? 'unknown'}`);
        sentenceTracker.reset();
        skipTrackerFeed = true;
        void coordinator?.acceptSentenceOffer(
          {
            original: pending.screenText,
            inserted: pending.inserted,
            outcome: pending.outcome,
            identical: pending.identical,
            terminator: pending.terminator,
          },
          editGeneration,
        );
      } else if (sentenceOffer.identical) {
        // A reads-well note never intercepts a key: the event (Space
        // included) is processed exactly as if it were not showing.
        clearSentenceOffer('reads well — kept as typed');
      } else {
        clearSentenceOffer('cleared — the user did something else first');
      }
    }
    // Mouse gestures (M5.16): spot a right-click → Paste menu pick.
    if (event.type === 'mouse') handleMousePasteGesture(event);
    const done = wordBuffer.handle(event);
    // Feed the sentence tracker the same event stream (M7). When the
    // Settings toggle is off the tracker simply stays reset.
    if (!skipTrackerFeed) {
      if (!sentenceOffersEnabled) {
        sentenceTracker.reset();
      } else if (event.type === 'char') {
        sentenceTracker.char(event.char ?? '');
      } else if (event.type === 'backspace') {
        sentenceTracker.backspace();
      } else if (event.type === 'delimiter') {
        if (done) {
          sentenceTracker.beginWord(done.word, done.delimiter);
        } else {
          const completion = sentenceTracker.verbatim(event.char ?? ' ');
          if (completion) onSentenceCompleted(completion);
        }
      } else {
        // 'reset' | 'modifier' | 'mouse': context changed mid-sentence.
        dropSentenceTracking('a click or control key');
      }
    }
    if (done) {
      console.log(
        `[KBMK] word: "${done.word}" (delimiter: ${delimiterLabel(done.delimiter)})`,
      );
      if (debugKeys) {
        // Display-independent proof of what was captured: if the terminal
        // codepage cannot draw Bengali, the word above looks like mojibake
        // while these code points stay readable ASCII.
        console.log(`[KBMK-DEBUG] word codepoints: ${codePointsOf(done.word)}`);
      }
      const generationAtCompletion = editGeneration;
      void coordinator?.handleCompleted(
        done,
        generationAtCompletion,
        state.source,
        state.target,
      );
    }
  };
  const debugLine = debugKeys
    ? (line: string) => console.log(`[KBMK-DEBUG] keydown ${line}`)
    : null;

  // Foreground-app tracking powers the block list (Windows only).
  if (process.platform === 'win32') {
    const tracker = new ForegroundAppTracker();
    if (tracker.available) {
      foregroundTracker = tracker;
      console.log('[KBMK] Foreground app tracking: active (block list enforced).');
    } else {
      console.log('[KBMK] Foreground app tracking unavailable — block list cannot be enforced.');
    }
  }
  const onHookError = (label: string) => (error: unknown) => {
    console.error(
      `[KBMK] ${label} unavailable. Cause:`,
      error instanceof Error ? error.message : error,
    );
  };

  // Primary key source on Windows: the Win32 hook, which sees real text
  // (keyboard layouts via ToUnicodeEx, and Avro's injected Unicode via
  // VK_PACKET). If it cannot start, we fall back to uiohook for keys.
  let win32Hook: Win32LayoutKeyHook | null = null;
  if (process.platform === 'win32') {
    win32Hook = new Win32LayoutKeyHook(onHookError('Windows text capture'), debugLine);
    win32Hook.start(feed);
    if (win32Hook.available) {
      console.log('[KBMK] Character source: Windows layout + Avro (Win32 hook).');
    } else {
      console.log(
        '[KBMK] Character source: uiohook keycodes (US layout fallback) — ' +
          'Bengali/Avro text will not be captured.',
      );
      win32Hook = null;
    }
  }

  // uiohook always runs: it provides mouse-click resets, and it is the key
  // source on non-Windows platforms and whenever the Win32 hook is absent.
  const hook = new UiohookKeyHook(
    (error) => {
      console.error(
        '[KBMK] Global keyboard hook unavailable; the pill still works, ' +
          'but words will not be captured. Cause:',
        error instanceof Error ? error.message : error,
      );
    },
    debugLine,
    { keysEnabled: win32Hook === null },
  );
  keyHook = hook;
  hook.start(feed);
  allHooks.push(hook);
  if (win32Hook) allHooks.push(win32Hook);
  app.on('before-quit', () => {
    hook.stop();
    win32Hook?.stop();
  });
  // Window focus change abandons the current word (spec).
  app.on('browser-window-focus', () => {
    wordBuffer.reset();
    dropSentenceTracking('focus changed');
  });
  app.on('browser-window-blur', () => {
    wordBuffer.reset();
    dropSentenceTracking('focus changed');
  });
}

function broadcast(): void {
  pillWindow?.webContents.send(IPC.stateChanged, state);
}

/* M5.10: the pill's usage readout — the active key's usage. DeepL
   reports real character usage; it is fetched at most every 5 minutes
   and cached, everything else shows the local monthly count. */
let deeplUsageCache: { profileId: string; count: number; limit: number; at: number } | null = null;
let deeplUsageInFlight = false;
const DEEPL_USAGE_TTL_MS = 5 * 60 * 1000;

function usageTextNow(): string {
  if (!profileStore) return '';
  if (profileStore.getProviderMode() === 'gtx') return 'Keyless';
  const active = profileStore.activeProfile();
  if (!active) return 'No key';
  if (active.provider === 'deepl' && deeplUsageCache?.profileId === active.id) {
    return usageTextFor({
      monthlyCount: active.monthlyCount,
      deepl: { count: deeplUsageCache.count, limit: deeplUsageCache.limit },
    });
  }
  return usageTextFor({ monthlyCount: active.monthlyCount });
}

async function refreshDeeplUsage(): Promise<void> {
  if (!profileStore || !profileRouter || deeplUsageInFlight) return;
  const active = profileStore.activeProfile();
  if (!active || active.provider !== 'deepl') return;
  if (
    deeplUsageCache?.profileId === active.id &&
    Date.now() - deeplUsageCache.at < DEEPL_USAGE_TTL_MS
  ) {
    return;
  }
  deeplUsageInFlight = true;
  try {
    const usage = await profileRouter.activeUsageChars();
    if (usage) {
      deeplUsageCache = { profileId: active.id, ...usage, at: Date.now() };
      setState({ ...state }); // repaint the pill with the real numbers
    }
  } catch {
    // Keep showing the local count; usage is a readout, never an error.
  } finally {
    deeplUsageInFlight = false;
  }
}

function setState(next: AppState): AppState {
  if (state.enabled && !next.enabled) {
    wordBuffer.reset(); // pausing drops any partial word
    dropSentenceTracking('paused');
  }
  next.usageText = usageTextNow();
  state = next;
  broadcast();
  void refreshDeeplUsage();
  return state;
}

/** Bottom-right of the primary display's work area (i.e. above the taskbar). */
function pillBounds(height: number): Electron.Rectangle {
  const area = screen.getPrimaryDisplay().workArea;
  return {
    x: area.x + area.width - PILL_WIDTH - EDGE_MARGIN,
    y: area.y + area.height - height - EDGE_MARGIN,
    width: PILL_WIDTH,
    height,
  };
}

/**
 * Kill the Windows DWM shadow/border around the pill window (M5.6).
 * Electron's `hasShadow: false` is documented as macOS-only, so on
 * Windows 11 the DWM still draws a soft RECTANGULAR shadow + hairline
 * border around the transparent window — visible as a grey rectangle
 * holding the round pill. DWMWA_NCRENDERING_POLICY = DWMNCRP_DISABLED
 * turns that off; the pill keeps its own CSS shadow, which follows
 * the rounded shape. Best-effort: any failure just logs.
 */
function disableDwmWindowShadow(win: BrowserWindow): void {
  if (process.platform !== 'win32') return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const koffi = require('koffi');
    const dwmapi = koffi.load('dwmapi.dll');
    const DwmSetWindowAttribute = dwmapi.func('DwmSetWindowAttribute', 'int', [
      'void *',
      'uint32',
      'void *',
      'uint32',
    ]);
    const DWMWA_NCRENDERING_POLICY = 2;
    const DWMNCRP_DISABLED = 2;
    const policy = Buffer.alloc(4);
    policy.writeInt32LE(DWMNCRP_DISABLED, 0);
    const hr = DwmSetWindowAttribute(
      win.getNativeWindowHandle(),
      DWMWA_NCRENDERING_POLICY,
      policy,
      4,
    );
    if (hr !== 0) {
      console.log(`[KBMK] DwmSetWindowAttribute hr=${hr} — a faint window shadow may remain.`);
    }
  } catch (error) {
    console.log(
      '[KBMK] could not disable the Windows window shadow:',
      error instanceof Error ? error.message : error,
    );
  }
}

/* FFI surface for the Windows glass blur — built once per process:
   koffi type names are global-once (the M5.4 lesson). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let glassFfi: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getGlassFfi(): any {
  if (glassFfi) return glassFfi;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const koffi = require('koffi');
  const AccentPolicy = koffi.struct('KbmkAccentPolicy', {
    AccentState: 'int',
    AccentFlags: 'int',
    GradientColor: 'uint32',
    AnimationId: 'int',
  });
  const WcaData = koffi.struct('KbmkWcaData', {
    Attrib: 'int',
    pvData: koffi.pointer(AccentPolicy),
    cbData: 'size_t',
  });
  const user32 = koffi.load('user32.dll');
  const gdi32 = koffi.load('gdi32.dll');
  glassFfi = {
    SetWindowCompositionAttribute: user32.func('SetWindowCompositionAttribute', 'int', [
      'void *',
      koffi.pointer(WcaData),
    ]),
    CreateRoundRectRgn: gdi32.func('CreateRoundRectRgn', 'void *', [
      'int',
      'int',
      'int',
      'int',
      'int',
      'int',
    ]),
    SetWindowRgn: user32.func('SetWindowRgn', 'int', ['void *', 'void *', 'int']),
  };
  return glassFfi;
}

/** Keep the window's rounded region matched to its current size, so
 *  the blur (and the window itself) hugs the pill/menu silhouette. */
function updatePillWindowRegion(win: BrowserWindow): void {
  if (process.platform !== 'win32' || win.isDestroyed()) return;
  try {
    const { width, height } = win.getBounds();
    const rgn = getGlassFfi().CreateRoundRectRgn(0, 0, width + 1, height + 1, 56, 56);
    getGlassFfi().SetWindowRgn(win.getNativeWindowHandle(), rgn, 1);
  } catch {
    // Cosmetic only — a square-cornered blur is still a blur.
  }
}

/**
 * Real frosted-glass blur for the pill window (M5.12, Windows only).
 * CSS backdrop-filter cannot blur OTHER programs behind a transparent
 * window — it only samples what the page itself paints — so over
 * another app the menu felt like plain see-through white. Windows'
 * own blur-behind (ACCENT_ENABLE_BLURBEHIND via
 * SetWindowCompositionAttribute) makes the DWM blur everything behind
 * the window for real; KBMK's translucent glass then paints over it.
 * Best-effort like the shadow fix: any failure just logs, and the CSS
 * look remains.
 */
function applyWindowsGlassBlur(win: BrowserWindow): void {
  if (process.platform !== 'win32') return;
  try {
    const WCA_ACCENT_POLICY = 19;
    const ACCENT_ENABLE_BLURBEHIND = 3;
    const ok = getGlassFfi().SetWindowCompositionAttribute(win.getNativeWindowHandle(), {
      Attrib: WCA_ACCENT_POLICY,
      pvData: {
        AccentState: ACCENT_ENABLE_BLURBEHIND,
        AccentFlags: 2,
        GradientColor: 0, // no tint — the CSS glass supplies the colour
        AnimationId: 0,
      },
      cbData: 16,
    });
    if (!ok) {
      console.log('[KBMK] Windows blur-behind was not applied (the CSS glass look remains).');
      return;
    }
    updatePillWindowRegion(win);
    win.on('resize', () => updatePillWindowRegion(win));
  } catch (error) {
    console.log(
      '[KBMK] could not enable the Windows glass blur:',
      error instanceof Error ? error.message : error,
    );
  }
}

function createPillWindow(): BrowserWindow {  const win = new BrowserWindow({
    ...pillBounds(PILL_HEIGHT),
    frame: false,
    transparent: true,
    // Fully transparent window background (alpha 0). Do NOT set
    // backgroundMaterial here: on Windows, Acrylic/Mica paints the whole
    // rectangular window with a grey material — that was the grey box
    // around the rounded pill in the user's screenshots. The glass look
    // lives on the pill itself (translucent white + red tint in CSS).
    backgroundColor: '#00000000',
    thickFrame: false,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    icon: join(__dirname, '../../assets/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setAlwaysOnTop(true, 'floating');
  disableDwmWindowShadow(win);
  applyWindowsGlassBlur(win);
  win.once('ready-to-show', () => disableDwmWindowShadow(win));
  const rendererFile = join(__dirname, '../renderer/index.html');
  void win.loadFile(rendererFile, { query: { view: 'pill' } });
  win.on('closed', () => {
    pillWindow = null;
  });
  return win;
}

function setExpanded(next: boolean, height?: number): ExpandDirection {
  if (!pillWindow) {
    expanded = next;
    return expandDirection;
  }
  const bounds = pillWindow.getBounds();
  // The anchor is derived from the bounds under the OLD expansion
  // state, before `expanded` flips.
  const anchorY = pillAnchorY(bounds, expanded, expandDirection, PILL_HEIGHT);
  expanded = next;
  const target = expanded ? (height ?? EXPANDED_HEIGHT) : PILL_HEIGHT;
  // Anchor to where the user actually left the pill (M5.11): the old
  // code recomputed the default bottom-right corner on every expand,
  // so opening a menu teleported the pill back home. The pill now
  // stays where it was dropped, and the content grows from it. Width
  // changes keep the RIGHT edge put (M5.13): the menu is full-width,
  // the collapsed pill hugs its content.
  const area = screen.getDisplayMatching(bounds).workArea;
  if (target > PILL_HEIGHT) {
    // Open upward normally; near the top of the screen, where there
    // is not room above but there is below, open downward instead.
    const grow = target - PILL_HEIGHT;
    expandDirection = expandDirectionFor(
      anchorY - area.y,
      area.y + area.height - (anchorY + PILL_HEIGHT),
      grow,
    );
  }
  // Expanded states get the full width — except the toast, which
  // hugs the pill (M5.17: a phrase-length paste offer needs the room).
  const TOAST_HEIGHT = 104; // mirrors the renderer's toast expansion
  const width = expanded && target !== TOAST_HEIGHT ? MENU_WIDTH : contentPillWidth;
  pillWindow.setBounds({
    x: rightAnchoredX(bounds.x + bounds.width, width, area),
    y: windowYFor(anchorY, expandDirection, target, PILL_HEIGHT),
    width,
    height: target,
  });
  // Re-clip the rounded region to the NEW size synchronously (M5.15):
  // the 'resize' event also does this, but the offer popup lives in
  // exactly the strip a stale region would cut off.
  updatePillWindowRegion(pillWindow);
  return expandDirection;
}

/**
 * The renderer reports the pill row's natural width (M5.13); the
 * collapsed window hugs it so no dead gap pools before the gear icon.
 * While the menu is open the width stays the menu's — the reported
 * width applies when it closes.
 */
function setPillWidth(reported: number): void {
  const width = Math.max(MIN_PILL_WIDTH, Math.min(MENU_WIDTH, Math.round(reported)));
  contentPillWidth = width;
  if (!pillWindow || expanded) return;
  const bounds = pillWindow.getBounds();
  if (bounds.width === width) return;
  const area = screen.getDisplayMatching(bounds).workArea;
  pillWindow.setBounds({
    x: rightAnchoredX(bounds.x + bounds.width, width, area),
    y: bounds.y,
    width,
    height: bounds.height,
  });
}

function registerIpc(): void {
  ipcMain.handle(IPC.getState, () => state);
  ipcMain.handle(IPC.setEnabled, (_e, enabled: boolean) =>
    setState(withEnabled(state, Boolean(enabled))),
  );
  ipcMain.handle(IPC.setLanguages, (_e, source: string, target: string) => {
    // A pair change mid-sentence voids the tracked sentence and any
    // offer built from the old pair (M7).
    dropSentenceTracking('the language pair changed');
    clearSentenceOffer('language changed');
    return setState(withLanguages(state, String(source), String(target)));
  });
  ipcMain.handle(IPC.swapLanguages, () => {
    dropSentenceTracking('the language pair changed');
    clearSentenceOffer('language changed');
    return setState(withSwap(state));
  });
  ipcMain.handle(IPC.openSettings, () => {
    openSettingsWindow();
  });
  ipcMain.handle(IPC.setExpanded, (_e, value: boolean, height?: number) =>
    setExpanded(Boolean(value), typeof height === 'number' ? height : undefined),
  );
  ipcMain.handle(IPC.setPillWidth, (_e, width: number) => {
    if (typeof width === 'number') setPillWidth(width);
  });
  ipcMain.handle(IPC.hidePill, () => {
    pillWindow?.hide();
  });

  /* Key profiles (M3). Every handler returns the safe view; secrets are
     accepted (add) but never returned. */
  const profilesView = () => profileStore!.view();
  ipcMain.handle(IPC.profilesView, () => profilesView());
  ipcMain.handle(
    IPC.profilesAdd,
    async (_e, label: string, secret: string, provider?: string, region?: string) => {
      await profileStore!.add(String(label), String(secret), {
        provider: normalizeProviderKind(provider),
        region: typeof region === 'string' ? region : undefined,
      });
      // A new (active) key means the API language list can now be fetched.
      void languageListService?.get(true);
      return profilesView();
    },
  );
  ipcMain.handle(IPC.profilesRemove, async (_e, id: string) => {
    await profileStore!.remove(String(id));
    return profilesView();
  });
  ipcMain.handle(IPC.profilesRename, (_e, id: string, label: string) => {
    profileStore!.rename(String(id), String(label));
    return profilesView();
  });
  ipcMain.handle(IPC.profilesSetActive, (_e, id: string) => {
    profileStore!.setActive(String(id));
    return profilesView();
  });
  ipcMain.handle(IPC.profilesTest, async (_e, id: string) => {
    await profileRouter!.testProfile(String(id));
    void languageListService?.get(true);
    return profilesView();
  });
  ipcMain.handle(
    IPC.profilesSetFallback,
    (_e, enabled: boolean, order: string[]) => {
      profileStore!.setFallback(
        Boolean(enabled),
        Array.isArray(order) ? order.map(String) : undefined,
      );
      return profilesView();
    },
  );
  ipcMain.handle(IPC.profilesSetProviderMode, (_e, mode: string) => {
    profileStore!.setProviderMode(mode === 'gtx' ? 'gtx' : 'google');
    return profilesView();
  });
  ipcMain.handle(IPC.profilesExport, () => profileStore!.exportSettings());
  ipcMain.handle(
    IPC.languages,
    () => languageListService?.get() ?? { languages: [], origin: 'builtin' as const },
  );

  /* App behaviour preferences (M5). Launch-at-login lives in the OS;
     the returned view always reflects the real OS state. */
  const readLaunchAtLogin = (): boolean => {
    try {
      return app.getLoginItemSettings().openAtLogin;
    } catch {
      return false;
    }
  };
  const preferencesView = (): PreferencesView => ({
    blockList: preferencesStore!.blockList(),
    launchAtLogin: readLaunchAtLogin(),
    launchAtLoginSupported: process.platform === 'win32' || process.platform === 'darwin',
    accent: preferencesStore!.accent(),
    opacity: preferencesStore!.glassOpacity(),
    sentenceOffers: preferencesStore!.sentenceOffers(),
  });
  ipcMain.handle(IPC.preferencesGet, () => preferencesView());
  ipcMain.handle(IPC.preferencesSetBlockList, (_e, list: string[]) => {
    const next = preferencesStore!.setBlockList(
      Array.isArray(list) ? list.map(String) : [],
    );
    blockSet = new Set(next);
    console.log(`[KBMK] block list updated (${next.length}): ${next.join(', ')}`);
    return preferencesView();
  });
  ipcMain.handle(IPC.preferencesSetLaunchAtLogin, (_e, enabled: boolean) => {
    try {
      app.setLoginItemSettings({ openAtLogin: Boolean(enabled) });
    } catch {
      // Unsupported platform: the view reports supported=false.
    }
    return preferencesView();
  });
  ipcMain.handle(IPC.openWindows, () => listOpenWindows());
  // Factory reset (M6.1): all keys (incl. secret-store secrets),
  // all preferences, the language cache, and launch-at-login are wiped.
  ipcMain.handle(IPC.resetAll, async () => {
    await profileStore?.removeAll();
    preferencesStore?.resetAll();
    languageListService?.clearCache();
    blockSet = new Set(preferencesStore!.blockList());
    deeplUsageCache = null;
    try {
      app.setLoginItemSettings({ openAtLogin: false });
    } catch {
      // Unsupported platform: nothing to clear.
    }
    clearPasteOffer('factory reset');
    clearSentenceOffer('factory reset');
    sentenceTracker.reset();
    sentenceOffersEnabled = preferencesStore!.sentenceOffers();
    setState({ ...state, accent: DEFAULT_ACCENT, opacity: 1, pasteOffer: null, sentenceOffer: null });
    console.log('[KBMK] factory reset: all keys and settings removed');
    return preferencesView();
  });
  ipcMain.handle(IPC.preferencesSetAccent, (_e, hex: string) => {
    const accent = preferencesStore!.setAccent(String(hex));
    setState({ ...state, accent }); // the pill re-tints live
    return preferencesView();
  });
  ipcMain.handle(IPC.preferencesSetOpacity, (_e, value: number) => {
    const opacity = preferencesStore!.setGlassOpacity(Number(value));
    setState({ ...state, opacity }); // the pill re-fades live
    return preferencesView();
  });
  ipcMain.handle(IPC.preferencesSetSentenceOffers, (_e, enabled: boolean) => {
    sentenceOffersEnabled = preferencesStore!.setSentenceOffers(Boolean(enabled));
    if (!sentenceOffersEnabled) {
      sentenceTracker.reset();
      clearSentenceOffer('turned off in Settings');
    }
    console.log(`[KBMK] sentence offers ${sentenceOffersEnabled ? 'on' : 'off'}`);
    return preferencesView();
  });

  /* Frameless window controls (M5.1): the Settings title bar's
     minimize/close buttons act on whichever window sent the request. */
  ipcMain.handle(IPC.windowClose, (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close();
  });
  ipcMain.handle(IPC.windowMinimize, (e) => {
    BrowserWindow.fromWebContents(e.sender)?.minimize();
  });
}

// Single instance only.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (pillWindow) {
      if (!pillWindow.isVisible()) pillWindow.show();
      pillWindow.focus();
    }
  });

  void app.whenReady().then(() => {
    setupProfilesAndTranslation();
    setupReplacement();
    registerIpc();
    pillWindow = createPillWindow();
    startHook();
    createTray({
      onShowHide: () => {
        if (!pillWindow) {
          pillWindow = createPillWindow();
          return;
        }
        if (pillWindow.isVisible()) pillWindow.hide();
        else pillWindow.show();
      },
      onTogglePause: () => {
        setState(withEnabled(state, !state.enabled));
      },
      onSettings: () => openSettingsWindow(),
      onQuit: () => app.quit(),
      isEnabled: () => state.enabled,
      isVisible: () => Boolean(pillWindow?.isVisible()),
    });
  });

  // Tray app: closing all windows must not quit on Windows.
  app.on('window-all-closed', () => {
    // Intentionally do nothing — Quit is via the tray menu.
  });
}
