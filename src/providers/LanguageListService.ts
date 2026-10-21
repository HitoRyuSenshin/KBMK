import type { ApiLanguageOption, LanguageListResult } from '../shared/types';
import type { KeyValueStore } from '../profiles/KeyValueStore';

const CACHE_KEY = 'languagesCache.v1';
const TTL_MS = 24 * 60 * 60 * 1000;

interface CachedLanguages {
  fetchedAt: number;
  languages: ApiLanguageOption[];
}

/**
 * Keeps the pill's language menus dependent on the API's supported
 * list (user request, M4.2): fetch the active key's languages from
 * Google, cache them for a day in the settings store, and fall back to
 * a stale cache (then to the renderer's built-in list) when offline or
 * keyless. Fetching never blocks typing — it happens on menu open.
 */
export class LanguageListService {
  private readonly kv: KeyValueStore;
  private readonly fetchApi: () => Promise<ApiLanguageOption[]>;
  private readonly now: () => number;

  constructor(
    kv: KeyValueStore,
    fetchApi: () => Promise<ApiLanguageOption[]>,
    now: () => number = () => Date.now(),
  ) {
    this.kv = kv;
    this.fetchApi = fetchApi;
    this.now = now;
  }

  async get(force = false): Promise<LanguageListResult> {
    const cached = this.readCache();
    if (!force && cached && this.now() - cached.fetchedAt < TTL_MS) {
      return { languages: cached.languages, origin: 'cache' };
    }
    try {
      const languages = await this.fetchApi();
      if (languages.length > 0) {
        this.kv.set(CACHE_KEY, { fetchedAt: this.now(), languages } satisfies CachedLanguages);
        return { languages, origin: 'api' };
      }
    } catch {
      // Offline / bad key / keyless: fall through to cache or built-in.
    }
    if (cached) return { languages: cached.languages, origin: 'cache' };
    return { languages: [], origin: 'builtin' };
  }

  /** Factory reset (M6.1): forget the cached API language list. */
  clearCache(): void {
    this.kv.delete(CACHE_KEY);
  }

  private readCache(): CachedLanguages | null {
    try {
      const raw = this.kv.get(CACHE_KEY) as CachedLanguages | undefined;
      if (raw && typeof raw.fetchedAt === 'number' && Array.isArray(raw.languages)) {
        return raw;
      }
    } catch {
      // Corrupt cache is just no cache.
    }
    return null;
  }
}
