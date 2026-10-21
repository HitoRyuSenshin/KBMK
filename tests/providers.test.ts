import { describe, expect, it } from 'vitest';
import {
  GoogleCloudProvider,
  decodeHtmlEntities,
  type FetchFn,
} from '../src/providers/GoogleCloudProvider';
import { UnofficialGtxProvider } from '../src/providers/UnofficialGtxProvider';
import { TranslationCache, cacheKey } from '../src/providers/TranslationCache';
import { applySourceCase } from '../src/shared/case';

const SECRET = 'AIza-TEST-SECRET-9999';

function fakeFetch(
  handler: (url: string, init?: { method?: string; body?: string }) => {
    status: number;
    body: unknown;
  },
): { fn: FetchFn; calls: Array<{ url: string; init?: { method?: string; body?: string } }> } {
  const calls: Array<{ url: string; init?: { method?: string; body?: string } }> = [];
  const fn: FetchFn = async (url, init) => {
    calls.push({ url, init });
    const { status, body } = handler(url, init);
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  return { fn, calls };
}

describe('GoogleCloudProvider', () => {
  it('POSTs the spec body, omits source for auto, parses translations[0]', async () => {
    const { fn, calls } = fakeFetch(() => ({
      status: 200,
      body: { data: { translations: [{ translatedText: 'hola' }] } },
    }));
    const provider = new GoogleCloudProvider(SECRET, fn);
    await expect(provider.translate('hello', 'auto', 'es')).resolves.toBe('hola');
    expect(calls[0].init?.method).toBe('POST');
    const body = JSON.parse(calls[0].init?.body ?? '{}') as Record<string, unknown>;
    expect(body).toEqual({ q: 'hello', target: 'es', format: 'text' });

    await provider.translate('hello', 'en', 'es');
    const body2 = JSON.parse(calls[1].init?.body ?? '{}') as Record<string, unknown>;
    expect(body2.source).toBe('en');
  });

  it('decodes HTML entities in results', async () => {
    expect(decodeHtmlEntities('l&#39;ami &amp; &quot;x&quot;')).toBe('l\'ami & "x"');
    const { fn } = fakeFetch(() => ({
      status: 200,
      body: { data: { translations: [{ translatedText: 'c&#39;est' }] } },
    }));
    await expect(new GoogleCloudProvider(SECRET, fn).translate('x', 'en', 'fr')).resolves.toBe(
      "c'est",
    );
  });

  it('maps keyInvalid to AuthError, dailyLimit to QuotaError, 429 to QuotaError', async () => {
    const auth = fakeFetch(() => ({
      status: 400,
      body: { error: { errors: [{ reason: 'keyInvalid' }] } },
    }));
    await expect(new GoogleCloudProvider(SECRET, auth.fn).translate('x', 'en', 'es')).rejects.toMatchObject({ kind: 'auth' });

    const quota = fakeFetch(() => ({
      status: 403,
      body: { error: { errors: [{ reason: 'dailyLimitExceeded' }] } },
    }));
    await expect(new GoogleCloudProvider(SECRET, quota.fn).translate('x', 'en', 'es')).rejects.toMatchObject({ kind: 'quota' });

    const limited = fakeFetch(() => ({ status: 429, body: {} }));
    await expect(new GoogleCloudProvider(SECRET, limited.fn).translate('x', 'en', 'es')).rejects.toMatchObject({ kind: 'quota' });
  });

  it('network failure becomes NetworkError and no error ever contains the key', async () => {
    const throwing: FetchFn = async () => {
      throw new Error(`fetch failed for https://example.test/?key=${SECRET}`);
    };
    await expect(new GoogleCloudProvider(SECRET, throwing).translate('x', 'en', 'es')).rejects.toMatchObject({ kind: 'network' });

    const { fn } = fakeFetch(() => ({
      status: 403,
      body: { error: { errors: [{ reason: 'keyInvalid' }] } },
    }));
    const error = await new GoogleCloudProvider(SECRET, fn)
      .translate('x', 'en', 'es')
      .catch((e: Error) => e);
    expect(error.message).not.toContain(SECRET);
    expect(error.message).not.toContain('key=');
  });

  it('testConnection succeeds on 200 and maps failures', async () => {
    const ok = fakeFetch(() => ({ status: 200, body: { data: { languages: [] } } }));
    await expect(new GoogleCloudProvider(SECRET, ok.fn).testConnection()).resolves.toBeUndefined();
    const bad = fakeFetch(() => ({
      status: 403,
      body: { error: { errors: [{ reason: 'keyInvalid' }] } },
    }));
    await expect(new GoogleCloudProvider(SECRET, bad.fn).testConnection()).rejects.toMatchObject({ kind: 'auth' });
  });
});

describe('UnofficialGtxProvider', () => {
  it('joins segments and builds the gtx URL', async () => {
    const { fn, calls } = fakeFetch(() => ({
      status: 200,
      body: [[['hola ', 'hello ', null, null, 1], ['mundo', 'world', null, null, 1]], null, 'en'],
    }));
    await expect(new UnofficialGtxProvider(fn).translate('hello world', 'en', 'es')).resolves.toBe('hola mundo');
    expect(calls[0].url).toContain('client=gtx');
    expect(calls[0].url).toContain('tl=es');
  });

  it('maps 429 to QuotaError', async () => {
    const { fn } = fakeFetch(() => ({ status: 429, body: null }));
    await expect(new UnofficialGtxProvider(fn).translate('x', 'en', 'es')).rejects.toMatchObject({ kind: 'quota' });
  });
});

describe('TranslationCache', () => {
  it('uses the spec key format and evicts least-recently-used beyond capacity', () => {
    expect(cacheKey('hello', 'en', 'es')).toBe('hello|en|es');
    const cache = new TranslationCache(3);
    cache.set('a|en|es', '1');
    cache.set('b|en|es', '2');
    cache.set('c|en|es', '3');
    expect(cache.get('a|en|es')).toBe('1'); // refresh a
    cache.set('d|en|es', '4'); // evicts b
    expect(cache.get('b|en|es')).toBeUndefined();
    expect(cache.get('a|en|es')).toBe('1');
    expect(cache.size).toBe(3);
    cache.clear();
    expect(cache.size).toBe(0);
  });
});

describe('applySourceCase', () => {
  it('capitalises the translation when the typed word starts with a capital', () => {
    expect(applySourceCase('Hello', 'hola')).toBe('Hola');
    expect(applySourceCase('hello', 'hola')).toBe('hola');
    expect(applySourceCase('আমি', 'ami')).toBe('ami'); // no case in Bengali letters
  });
});
