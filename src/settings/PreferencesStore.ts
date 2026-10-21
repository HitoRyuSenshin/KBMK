import type { KeyValueStore } from '../profiles/KeyValueStore';
import { DEFAULT_BLOCK_LIST, normalizeBlockList } from './blockList';
import { DEFAULT_ACCENT, clampGlassOpacity, normalizeHexColor } from '../shared/color';

const BLOCK_LIST_KEY = 'appBlockList.v1';
const ACCENT_KEY = 'accentColor.v1';
const OPACITY_KEY = 'glassOpacity.v1';
const SENTENCE_OFFERS_KEY = 'sentenceOffers.v1';

/**
 * App preferences that live beside the key profiles in the settings
 * store (M5). Only the block list is persisted here; launch-at-login
 * state lives in the OS (Electron login item) and is read live.
 */
export class PreferencesStore {
  private readonly kv: KeyValueStore;

  constructor(kv: KeyValueStore) {
    this.kv = kv;
  }

  /** The stored list, or the password-manager defaults if never set.
   *  An explicitly emptied list stays empty. */
  blockList(): string[] {
    const raw = this.kv.get<unknown>(BLOCK_LIST_KEY);
    if (!Array.isArray(raw)) return [...DEFAULT_BLOCK_LIST];
    return normalizeBlockList(raw.filter((x): x is string => typeof x === 'string'));
  }

  setBlockList(list: string[]): string[] {
    const normalized = normalizeBlockList(list);
    this.kv.set(BLOCK_LIST_KEY, normalized);
    return normalized;
  }

  /** Glass accent colour; the stored value if valid, else KBMK red. */
  accent(): string {
    return normalizeHexColor(this.kv.get<unknown>(ACCENT_KEY)) ?? DEFAULT_ACCENT;
  }

  setAccent(hex: string): string {
    const normalized = normalizeHexColor(hex);
    if (!normalized) throw new Error(`Not a colour: ${hex}`);
    this.kv.set(ACCENT_KEY, normalized);
    return normalized;
  }

  /** Glass opacity (M5.10); the stored value clamped, else fully solid. */
  glassOpacity(): number {
    return clampGlassOpacity(this.kv.get<unknown>(OPACITY_KEY));
  }

  setGlassOpacity(value: unknown): number {
    const clamped = clampGlassOpacity(value);
    this.kv.set(OPACITY_KEY, clamped);
    return clamped;
  }

  /** Sentence offers (M7): on unless the user turned them off. */
  sentenceOffers(): boolean {
    return this.kv.get<unknown>(SENTENCE_OFFERS_KEY) !== false;
  }

  setSentenceOffers(value: boolean): boolean {
    this.kv.set(SENTENCE_OFFERS_KEY, Boolean(value));
    return this.sentenceOffers();
  }

  /** Factory reset (M6.1): block list, accent and opacity return to
   *  their defaults (the keys are removed, so the defaults apply). */
  resetAll(): void {
    this.kv.delete(BLOCK_LIST_KEY);
    this.kv.delete(ACCENT_KEY);
    this.kv.delete(OPACITY_KEY);
    this.kv.delete(SENTENCE_OFFERS_KEY);
  }
}
