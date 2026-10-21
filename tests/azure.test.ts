import { describe, expect, it } from 'vitest';
import {
  AzureTranslatorProvider,
  azureLangCode,
  canonicalLangCode,
} from '../src/providers/AzureTranslatorProvider';
import type { FetchFn } from '../src/providers/GoogleCloudProvider';
import { MemoryKeyValueStore } from '../src/profiles/KeyValueStore';
import { ProfileStore } from '../src/profiles/ProfileStore';
import { ProfileRouter } from '../src/profiles/ProfileRouter';
import { FakeSecretStore } from '../src/profiles/SecretStore';

const KEY = 'AZURE-SECRET-KEY-4321';

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

describe('AzureTranslatorProvider', () => {
  it('sends the documented request: headers with key+region, mapped codes, [{text}] body', async () => {
    const { calls, fetchFn } = captureFetch({ body: [{ translations: [{ text: '你好', to: 'zh-Hans' }] }] });
    const provider = new AzureTranslatorProvider(KEY, 'southeastasia', fetchFn);
    await expect(provider.translate('hello', 'en', 'zh-CN')).resolves.toBe('你好');
    const { url, init } = calls[0];
    expect(url).toContain('/translate?');
    expect(url).toContain('api-version=3.0');
    expect(url).toContain('to=zh-Hans'); // canonical zh-CN mapped to Azure's code
    expect(url).toContain('from=en');
    expect(init?.headers?.['Ocp-Apim-Subscription-Key']).toBe(KEY);
    expect(init?.headers?.['Ocp-Apim-Subscription-Region']).toBe('southeastasia');
    expect(init?.body).toBe(JSON.stringify([{ text: 'hello' }]));
  });

  it('omits from= for auto-detect and omits the region header for global resources', async () => {
    const { calls, fetchFn } = captureFetch({ body: [{ translations: [{ text: 'hola' }] }] });
    const provider = new AzureTranslatorProvider(KEY, 'global', fetchFn);
    await provider.translate('hello', 'auto', 'es');
    expect(calls[0].url).not.toContain('from=');
    expect(calls[0].init?.headers?.['Ocp-Apim-Subscription-Region']).toBeUndefined();
  });

  it('maps 401/403 to AuthError and 429 to QuotaError; messages never contain the key', async () => {
    const auth = captureFetch({ status: 401, body: { error: { code: 401000, message: 'denied' } } });
    await expect(
      new AzureTranslatorProvider(KEY, 'eastus', auth.fetchFn).translate('x', 'en', 'es'),
    ).rejects.toMatchObject({ kind: 'auth' });
    const quota = captureFetch({ status: 429, body: { error: { code: 429001, message: 'slow down' } } });
    const error = await new AzureTranslatorProvider(KEY, 'eastus', quota.fetchFn)
      .translate('x', 'en', 'es')
      .catch((e: Error) => e);
    expect(error).toMatchObject({ kind: 'quota' });
    expect(error.message).not.toContain(KEY);
  });

  it('listLanguages maps Azure codes back to canonical ones', async () => {
    const { fetchFn } = captureFetch({
      body: {
        translation: {
          'zh-Hans': { name: 'Chinese (Simplified)' },
          fil: { name: 'Filipino' },
          nb: { name: 'Norwegian Bokmål' },
        },
      },
    });
    const provider = new AzureTranslatorProvider(KEY, 'eastus', fetchFn);
    await expect(provider.listLanguages()).resolves.toEqual([
      { code: 'zh-CN', name: 'Chinese (Simplified)' },
      { code: 'fil', name: 'Filipino' },
      { code: 'no', name: 'Norwegian Bokmål' },
    ]);
  });

  it('code mapping round-trips the special cases', () => {
    expect(azureLangCode('zh-TW')).toBe('zh-Hant');
    expect(azureLangCode('tl')).toBe('fil');
    expect(azureLangCode('bn')).toBe('bn');
    expect(canonicalLangCode('zh-Hant')).toBe('zh-TW');
  });
});

describe('Azure key profiles (store + router)', () => {
  function makeStore() {
    let seq = 0;
    return new ProfileStore(new MemoryKeyValueStore(), new FakeSecretStore(), {
      idGen: () => `id-${++seq}`,
      now: () => new Date(2026, 9, 16).getTime(),
    });
  }

  it('add stores provider + region; Azure without a region is rejected', async () => {
    const store = makeStore();
    const meta = await store.add('Azure key', KEY, { provider: 'azure', region: 'southeastasia' });
    expect(meta).toMatchObject({ provider: 'azure', region: 'southeastasia' });
    await expect(store.add('Bad', KEY, { provider: 'azure' })).rejects.toThrow(/region/);
    const google = await store.add('Google key', KEY);
    expect(google.provider).toBe('google');
    expect(google.region).toBeUndefined();
  });

  it('profiles stored before M4.3 read back as Google', async () => {
    const kv = new MemoryKeyValueStore();
    kv.set('keyProfiles.v1', {
      profiles: [
        {
          id: 'old-1',
          label: 'Old key',
          createdAt: 1,
          lastUsedAt: null,
          monthlyCount: 3,
          counterMonth: '2026-10',
          status: 'valid',
          last4: '9999',
        },
      ],
      activeProfileId: 'old-1',
      fallbackEnabled: false,
      fallbackOrder: ['old-1'],
      providerMode: 'google',
    });
    const store = new ProfileStore(kv, new FakeSecretStore(), {
      now: () => new Date(2026, 9, 16).getTime(),
    });
    expect(store.view().profiles[0].provider).toBe('google');
  });

  it('the router dispatches per key: Azure profile uses the Azure factory with its region', async () => {
    const store = makeStore();
    await store.add('G', 'GOOGLE-KEY-1111');
    const azureProfile = await store.add('A', KEY, { provider: 'azure', region: 'eastus' });
    store.setActive(azureProfile.id);
    const seen: Array<[string, string]> = [];
    const router = new ProfileRouter({
      store,
      googleFactory: () => ({ id: 'google', translate: async () => 'google!' }),
      azureFactory: (key, region) => {
        seen.push([key, region]);
        return { id: 'azure', translate: async (t) => `azure:${t}` };
      },
    });
    await expect(router.attempt('hello', 'en', 'es')).resolves.toMatchObject({
      text: 'azure:hello',
      providerId: 'azure',
      profileLabel: 'A',
    });
    expect(seen).toEqual([[KEY, 'eastus']]);
    expect(store.view().profiles.find((p) => p.id === azureProfile.id)?.monthlyCount).toBe(1);
  });

  it('quota fallback can cross providers (Google quota -> Azure key takes over)', async () => {
    const store = makeStore();
    const g = await store.add('G', 'GOOGLE-KEY-2222');
    const a = await store.add('A', KEY, { provider: 'azure', region: 'westus' });
    store.setActive(g.id);
    store.setFallback(true);
    const { QuotaError } = await import('../src/providers/errors');
    const router = new ProfileRouter({
      store,
      googleFactory: () => ({
        id: 'google',
        translate: async () => {
          throw new QuotaError();
        },
      }),
      azureFactory: () => ({ id: 'azure', translate: async () => 'rescued' }),
    });
    await expect(router.attempt('hello', 'en', 'es')).resolves.toMatchObject({
      text: 'rescued',
      switchedFromLabel: 'G',
    });
    expect(store.view().activeProfileId).toBe(a.id);
  });
});
