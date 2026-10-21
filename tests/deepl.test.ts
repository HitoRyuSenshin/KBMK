import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeProviderKind } from '../src/shared/types';
import {
  DeepLTranslatorProvider,
  canonicalFromDeepl,
  deeplHostForKey,
  deeplLangCode,
} from '../src/providers/DeepLTranslatorProvider';
import type { FetchFn } from '../src/providers/GoogleCloudProvider';
import { MemoryKeyValueStore } from '../src/profiles/KeyValueStore';
import { ProfileStore } from '../src/profiles/ProfileStore';
import { ProfileRouter } from '../src/profiles/ProfileRouter';
import { FakeSecretStore } from '../src/profiles/SecretStore';

const FREE_KEY = '11111111-2222-3333-4444-555555555555:fx';
const PRO_KEY = '11111111-2222-3333-4444-555555555555';

function captureFetch(response: { status?: number; body: unknown }) {
  const calls: Array<{ url: string; init?: { method?: string; headers?: Record<string, string>; body?: string } }> = [];
  const fetchFn: FetchFn = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: (response.status ?? 200) < 400,
      status: response.status ?? 200,
      json: async () => response.body,
    };
  };
  return { calls, fetchFn };
}

describe('DeepLTranslatorProvider', () => {
  it('picks the host from the key: ":fx" suffix -> free host, otherwise api.deepl.com', () => {
    expect(deeplHostForKey(FREE_KEY)).toBe('https://api-free.deepl.com');
    expect(deeplHostForKey(PRO_KEY)).toBe('https://api.deepl.com');
  });

  it('sends the documented request: DeepL-Auth-Key header, JSON body, mapped codes', async () => {
    const { calls, fetchFn } = captureFetch({
      body: { translations: [{ detected_source_language: 'EN', text: '你好' }] },
    });
    const provider = new DeepLTranslatorProvider(PRO_KEY, fetchFn);
    await expect(provider.translate('hello', 'en', 'zh-CN')).resolves.toBe('你好');
    const { url, init } = calls[0];
    expect(url).toBe('https://api.deepl.com/v2/translate');
    expect(init?.headers?.Authorization).toBe(`DeepL-Auth-Key ${PRO_KEY}`);
    expect(JSON.parse(init?.body ?? '{}')).toEqual({
      text: ['hello'],
      source_lang: 'EN',
      target_lang: 'ZH-HANS',
    });
  });

  it('uses the free host end-to-end for :fx keys and omits source_lang for auto', async () => {
    const { calls, fetchFn } = captureFetch({ body: { translations: [{ text: 'hola' }] } });
    const provider = new DeepLTranslatorProvider(FREE_KEY, fetchFn);
    await provider.translate('hello', 'auto', 'es');
    expect(calls[0].url).toBe('https://api-free.deepl.com/v2/translate');
    expect(JSON.parse(calls[0].init?.body ?? '{}')).toEqual({ text: ['hello'], target_lang: 'ES' });
  });

  it('maps errors: 403 auth, 456 quota, 429 quota, 400 bad-request; messages never contain the key', async () => {
    const cases: Array<[number, string]> = [
      [403, 'auth'],
      [456, 'quota'],
      [429, 'quota'],
      [400, 'bad-request'],
    ];
    for (const [status, kind] of cases) {
      const { fetchFn } = captureFetch({ status, body: { message: 'nope' } });
      const error = await new DeepLTranslatorProvider(PRO_KEY, fetchFn)
        .translate('x', 'en', 'es')
        .catch((e: Error & { kind?: string }) => e);
      expect(error).toMatchObject({ kind });
      expect((error as Error).message).not.toContain(PRO_KEY);
    }
  });

  it('listLanguages maps DeepL codes back to canonical ones', async () => {
    const { calls, fetchFn } = captureFetch({
      body: [
        { language: 'DE', name: 'German' },
        { language: 'ZH-HANS', name: 'Chinese (simplified)' },
        { language: 'EN-GB', name: 'English (British)' },
        { language: 'NB', name: 'Norwegian (Bokmål)' },
      ],
    });
    const provider = new DeepLTranslatorProvider(PRO_KEY, fetchFn);
    await expect(provider.listLanguages()).resolves.toEqual([
      { code: 'de', name: 'German' },
      { code: 'zh-CN', name: 'Chinese (simplified)' },
      { code: 'en', name: 'English (British)' },
      { code: 'no', name: 'Norwegian (Bokmål)' },
    ]);
    expect(calls[0].url).toContain('/v2/languages?type=target');
    expect(calls[0].init?.headers?.Authorization).toBe(`DeepL-Auth-Key ${PRO_KEY}`);
  });

  it('code mapping round-trips the special cases', () => {
    expect(deeplLangCode('zh-TW')).toBe('ZH-HANT');
    expect(deeplLangCode('no')).toBe('NB');
    expect(deeplLangCode('es')).toBe('ES');
    expect(canonicalFromDeepl('PT-BR')).toBe('pt-BR');
    expect(canonicalFromDeepl('FR')).toBe('fr');
  });

  it('getUsageChars reads DeepL /v2/usage into count/limit (M5.10 pill readout)', async () => {
    const { calls, fetchFn } = captureFetch({
      body: { character_count: 1234, character_limit: 500000 },
    });
    const provider = new DeepLTranslatorProvider(FREE_KEY, fetchFn);
    await expect(provider.getUsageChars()).resolves.toEqual({ count: 1234, limit: 500000 });
    expect(calls[0].url).toBe('https://api-free.deepl.com/v2/usage');
    expect(calls[0].init?.headers?.Authorization).toBe(`DeepL-Auth-Key ${FREE_KEY}`);
  });
});

describe('provider kind at the IPC boundary (M5.9 regression)', () => {
  it('normalizeProviderKind keeps deepl and azure, defaults the rest to google', () => {
    expect(normalizeProviderKind('deepl')).toBe('deepl');
    expect(normalizeProviderKind('azure')).toBe('azure');
    expect(normalizeProviderKind('google')).toBe('google');
    expect(normalizeProviderKind(undefined)).toBe('google');
    expect(normalizeProviderKind('junk')).toBe('google');
  });

  it('the main-process add-profile handler routes through normalizeProviderKind', () => {
    // The M5.8 bug lived here: an inline `=== 'azure' ? 'azure' :
    // 'google'` ternary flattened 'deepl' before ProfileStore saw it.
    const mainSource = readFileSync(join(__dirname, '..', 'src', 'main', 'main.ts'), 'utf8');
    expect(mainSource).toContain('normalizeProviderKind(provider)');
    expect(mainSource).not.toContain("provider === 'azure' ? 'azure' : 'google'");
  });
});

describe('DeepL key profiles (store + router)', () => {
  function makeStore() {
    let seq = 0;
    return new ProfileStore(new MemoryKeyValueStore(), new FakeSecretStore(), {
      idGen: () => `id-${++seq}`,
      now: () => new Date(2026, 9, 16).getTime(),
    });
  }

  it('add stores provider deepl with no region', async () => {
    const store = makeStore();
    const meta = await store.add('DeepL key', FREE_KEY, { provider: 'deepl' });
    expect(meta).toMatchObject({ provider: 'deepl' });
    expect(meta.region).toBeUndefined();
  });

  it('the router dispatches a DeepL profile to the DeepL factory', async () => {
    const store = makeStore();
    const deeplProfile = await store.add('D', FREE_KEY, { provider: 'deepl' });
    store.setActive(deeplProfile.id);
    const seen: string[] = [];
    const router = new ProfileRouter({
      store,
      deeplFactory: (key: string) => {
        seen.push(key);
        return {
          id: 'deepl',
          translate: async (text: string) => `deepl:${text}`,
          testConnection: async () => undefined,
        };
      },
    });
    const result = await router.attempt('hello', 'en', 'de');
    expect(result.text).toBe('deepl:hello');
    expect(result.providerId).toBe('deepl');
    expect(seen).toEqual([FREE_KEY]);
  });
});
