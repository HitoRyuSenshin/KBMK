export type PillStatus =
  | 'Ready'
  | 'Fetching'
  | 'Replaced'
  | 'Cached'
  | 'Offline'
  | 'Paused';

export interface Language {
  /** ISO 639-1 code, e.g. "en", "es", "bn", "ar". "auto" is source-only. */
  code: string;
  label: string;
  nativeLabel: string;
  /** Common alternate names users type into search, e.g. "Bangla" for Bengali. */
  aliases?: string[];
}

export interface AppState {
  enabled: boolean;
  /** "auto" or a language code. */
  source: string;
  /** Language code, never "auto". */
  target: string;
  status: PillStatus;
  /** Milliseconds of the last (mock in M1) replacement, for "Replaced (ms)". */
  lastReplaceMs: number | null;
  /** Transient pill notice (e.g. "Switched to Rafi's key"); seq dedupes toasts. */
  notice: string | null;
  noticeSeq: number;
  /** Glass accent colour, "#rrggbb" (M5.2; default KBMK red). */
  accent: string;
  /** Glass opacity, 0.35–1 (M5.10; 1 = the original solid look). */
  opacity: number;
  /** Active key's usage readout for the pill (M5.10), e.g. "107 this month". */
  usageText?: string;
  /** A pending paste-translation offer shown above the pill (M5.14):
   *  Space accepts the swap, Alt+Space keeps the pasted word. */
  pasteOffer: { original: string; inserted: string } | null;
  /** A pending sentence-translation offer shown above the pill (M7):
   *  `original` is the sentence as it reads on screen (the word-by-word
   *  draft), `inserted` the whole-sentence translation. Space accepts
   *  the swap, Esc keeps the draft. */
  sentenceOffer: { original: string; inserted: string; identical?: boolean } | null;
}

export const DEFAULT_STATE: AppState = {
  enabled: true,
  source: 'auto',
  target: 'es',
  status: 'Ready',
  lastReplaceMs: null,
  notice: null,
  noticeSeq: 0,
  accent: '#e24b4a',
  opacity: 1,
  pasteOffer: null,
  sentenceOffer: null,
};

/* ---------------- Key profiles (M3) ---------------- */

export type ProfileStatus = 'unknown' | 'valid' | 'invalid' | 'quota';
export type ProviderMode = 'google' | 'gtx';
/** Which API a key profile belongs to (M4.3: Azure added beside Google). */
export type ProviderKind = 'google' | 'azure' | 'deepl';

/**
 * Coerce an untyped value (e.g. arriving over IPC) to a ProviderKind.
 * Anything unrecognised is a Google key — the original provider. Every
 * boundary that accepts a provider string must go through this, never
 * an ad-hoc ternary: an `=== 'azure' ? ... : 'google'` check silently
 * flattened 'deepl' to 'google' (M5.9 bug, caught by the user).
 */
export function normalizeProviderKind(value: unknown): ProviderKind {
  return value === 'azure' || value === 'deepl' ? value : 'google';
}

/** Non-secret profile metadata. The secret itself lives ONLY in keytar. */
export interface KeyProfileMeta {
  id: string;
  label: string;
  /** Which translation API this key belongs to. */
  provider: ProviderKind;
  /** Azure only: the resource's region (e.g. "southeastasia", or "global"). */
  region?: string;
  createdAt: number;
  lastUsedAt: number | null;
  /** Local counter of API translations this month (never sent anywhere). */
  monthlyCount: number;
  status: ProfileStatus;
  last4: string;
}

/** Exactly what the renderer is allowed to see — never the key. */
export interface SafeProfileView extends KeyProfileMeta {
  isActive: boolean;
}

export interface ProfilesView {
  profiles: SafeProfileView[];
  activeProfileId: string | null;
  fallbackEnabled: boolean;
  fallbackOrder: string[];
  providerMode: ProviderMode;
  keyStoreAvailable: boolean;
  /** Platform-correct display name of the OS secret store (M6.4). */
  keyStoreName: string;
  /** How to repair the secret store on this platform (M6.4). */
  keyStoreHint: string;
}

/** One entry of the provider's supported-language list (M4.2). */
export interface ApiLanguageOption {
  code: string;
  /** Display name in English, as the provider reports it. */
  name: string;
}

export interface LanguageListResult {
  languages: ApiLanguageOption[];
  /** 'api' = fetched live, 'cache' = stored copy, 'builtin' = no list available. */
  origin: 'api' | 'cache' | 'builtin';
}

/** App-behaviour preferences shown in Settings (M5). */
export interface PreferencesView {
  blockList: string[];
  launchAtLogin: boolean;
  /** False where login items don't exist (e.g. Linux dev builds). */
  launchAtLoginSupported: boolean;
  /** Glass accent colour, "#rrggbb" (M5.2). */
  accent: string;
  /** Glass opacity, 0.35–1 (M5.10). */
  opacity: number;
  /** Sentence offers at sentence end (M7); on unless turned off. */
  sentenceOffers: boolean;
}

/** One entry of the block-list window picker (M5.1, OBS-style). */
export interface OpenWindowInfo {
  processName: string;
  title: string;
}

/** Channels used between renderer, preload and main. */
export const IPC = {
  getState: 'kbmk:get-state',
  setEnabled: 'kbmk:set-enabled',
  setLanguages: 'kbmk:set-languages',
  swapLanguages: 'kbmk:swap-languages',
  openSettings: 'kbmk:open-settings',
  setExpanded: 'kbmk:set-expanded',
  setPillWidth: 'kbmk:set-pill-width',
  stateChanged: 'kbmk:state-changed',
  hidePill: 'kbmk:hide-pill',
  profilesView: 'kbmk:profiles-view',
  profilesAdd: 'kbmk:profiles-add',
  profilesRemove: 'kbmk:profiles-remove',
  profilesRename: 'kbmk:profiles-rename',
  profilesSetActive: 'kbmk:profiles-set-active',
  profilesTest: 'kbmk:profiles-test',
  profilesSetFallback: 'kbmk:profiles-set-fallback',
  profilesSetProviderMode: 'kbmk:profiles-set-provider-mode',
  profilesExport: 'kbmk:profiles-export',
  languages: 'kbmk:get-languages',
  preferencesGet: 'kbmk:get-preferences',
  preferencesSetBlockList: 'kbmk:set-block-list',
  preferencesSetLaunchAtLogin: 'kbmk:set-launch-at-login',
  openWindows: 'kbmk:get-open-windows',
  windowClose: 'kbmk:window-close',
  windowMinimize: 'kbmk:window-minimize',
  preferencesSetAccent: 'kbmk:set-accent',
  preferencesSetOpacity: 'kbmk:set-opacity',
  preferencesSetSentenceOffers: 'kbmk:set-sentence-offers',
  resetAll: 'kbmk:reset-all',
} as const;
