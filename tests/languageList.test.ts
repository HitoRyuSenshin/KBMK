import { describe, expect, it } from 'vitest';
import { GoogleCloudProvider, type FetchFn } from '../src/providers/GoogleCloudProvider';
import { LanguageListService } from '../src/providers/LanguageListService';
import { MemoryKeyValueStore } from '../src/profiles/KeyValueStore';
import { LANGUAGES, searchLanguages } from '../src/shared/languages';
import { mergeLanguageLists } from '../src/shared/languageCatalog';

describe('GoogleCloudProvider.listLanguages', () => {
  it('parses the supported list; the key stays out of the result', async () => {
    const fetchFn: FetchFn = async (url) => {
      expect(url).toContain('/languages');
      expect(url).toContain('target=en');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            languages: [
              { language: 'fil', name: 'Filipino' },
              { language: 'bn', name: 'Bengali' },
            ],
          },
        }),
      };
    };
    const provider = new GoogleCloudProvider('AIza-TEST-SECRET-9999', fetchFn);
    const list = await provider.listLanguages();
    expect(list).toEqual([
      { code: 'fil', name: 'Filipino' },
      { code: 'bn', name: 'Bengali' },
    ]);
    expect(JSON.stringify(list)).not.toContain('AIza-TEST-SECRET');
  });
});

describe('LanguageListService', () => {
  const sample = [
    { code: 'fil', name: 'Filipino' },
    { code: 'en', name: 'English' },
  ];

  it('fetches live, caches, then serves the cache within the TTL', async () => {
    const kv = new MemoryKeyValueStore();
    let fetches = 0;
    let now = 1_000_000;
    const service = new LanguageListService(
      kv,
      async () => {
        fetches++;
        return sample;
      },
      () => now,
    );
    await expect(service.get()).resolves.toEqual({ languages: sample, origin: 'api' });
    now += 60_000;
    await expect(service.get()).resolves.toEqual({ languages: sample, origin: 'cache' });
    expect(fetches).toBe(1);
    now += 25 * 60 * 60 * 1000; // past the 24 h TTL
    await expect(service.get()).resolves.toEqual({ languages: sample, origin: 'api' });
    expect(fetches).toBe(2);
  });

  it('falls back to a stale cache when the fetch fails; to builtin when there is none', async () => {
    const kv = new MemoryKeyValueStore();
    kv.set('languagesCache.v1', { fetchedAt: 0, languages: sample });
    const offline = new LanguageListService(kv, async () => {
      throw new Error('offline');
    });
    await expect(offline.get()).resolves.toEqual({ languages: sample, origin: 'cache' });

    const empty = new LanguageListService(new MemoryKeyValueStore(), async () => {
      throw new Error('offline');
    });
    await expect(empty.get()).resolves.toEqual({ languages: [], origin: 'builtin' });
  });
});

describe('language catalog', () => {
  it('the built-in fallback now includes Filipino (searchable as "philippine")', () => {
    expect(LANGUAGES.some((l) => l.code === 'fil')).toBe(true);
    expect(searchLanguages('philippine').map((l) => l.code)).toContain('fil');
    expect(searchLanguages('filipino').map((l) => l.code)).toContain('fil');
  });

  it('merge: API decides membership/names; built-in adds native labels + aliases; sorted', () => {
    const merged = mergeLanguageLists([
      { code: 'fil', name: 'Filipino' },
      { code: 'bn', name: 'Bengali' },
      { code: 'xx', name: 'X Language' },
    ]);
    expect(merged.map((l) => l.code)).toEqual(['bn', 'fil', 'xx']); // sorted by label
    const bn = merged.find((l) => l.code === 'bn')!;
    expect(bn.nativeLabel).toBe('বাংলা');
    expect(bn.aliases).toContain('bangla');
    const fil = merged.find((l) => l.code === 'fil')!;
    expect(fil.label).toBe('Filipino');
    // A language the API does not report is not in the merged list.
    expect(merged.some((l) => l.code === 'de')).toBe(false);
  });
});
