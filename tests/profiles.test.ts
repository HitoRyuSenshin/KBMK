import { describe, expect, it } from 'vitest';
import { MemoryKeyValueStore } from '../src/profiles/KeyValueStore';
import { ProfileStore } from '../src/profiles/ProfileStore';
import { ProfileRouter } from '../src/profiles/ProfileRouter';
import { FakeSecretStore } from '../src/profiles/SecretStore';
import type { TranslationProvider } from '../src/providers/TranslationProvider';
import { AuthError, QuotaError } from '../src/providers/errors';

const SECRET_A = 'AIza-SECRET-AAAA-1111';
const SECRET_B = 'AIza-SECRET-BBBB-2222';
const SECRET_C = 'AIza-SECRET-CCCC-3333';

function makeStore(nowStart = new Date(2026, 9, 16, 12).getTime()) {
  let now = nowStart;
  let seq = 0;
  const kv = new MemoryKeyValueStore();
  const secrets = new FakeSecretStore();
  const store = new ProfileStore(kv, secrets, {
    now: () => now,
    idGen: () => `id-${++seq}`,
  });
  return {
    kv,
    secrets,
    store,
    setNow: (t: number) => {
      now = t;
    },
  };
}

const providerReturning =
  (text: string) =>
  (key: string): TranslationProvider => ({
    id: 'google',
    translate: async () => `${text} via ${key.slice(-4)}`,
  });

describe('ProfileStore', () => {
  it('add: first profile becomes active, secret goes ONLY to the secret store', async () => {
    const { store, secrets, kv } = makeStore();
    const meta = await store.add('My key', SECRET_A);
    expect(meta).toMatchObject({ label: 'My key', last4: '1111', status: 'unknown', monthlyCount: 0 });
    expect(store.view().activeProfileId).toBe(meta.id);
    await expect(secrets.get(meta.id)).resolves.toBe(SECRET_A);
    expect(JSON.stringify([...kv.data.values()])).not.toContain(SECRET_A);
  });

  it('add validates label and secret', async () => {
    const { store } = makeStore();
    await expect(store.add('  ', SECRET_A)).rejects.toThrow(/label/);
    await expect(store.add('x', '  ')).rejects.toThrow(/key/);
  });

  it('rename, setActive and remove (secret deleted, active reassigned)', async () => {
    const { store, secrets } = makeStore();
    const a = await store.add('A', SECRET_A);
    const b = await store.add('B', SECRET_B);
    store.rename(a.id, 'Renamed');
    expect(store.view().profiles.find((p) => p.id === a.id)?.label).toBe('Renamed');
    store.setActive(b.id);
    expect(store.view().activeProfileId).toBe(b.id);
    await store.remove(b.id);
    expect(store.view().activeProfileId).toBe(a.id);
    await expect(secrets.get(b.id)).resolves.toBeNull();
    expect(store.view().profiles.map((p) => p.id)).toEqual([a.id]);
  });

  it('removeAll (factory reset): every secret deleted, metadata empty', async () => {
    const { store, secrets } = makeStore();
    const a = await store.add('A', SECRET_A);
    const b = await store.add('B', SECRET_B);
    await store.removeAll();
    expect(store.view().profiles).toEqual([]);
    expect(store.view().activeProfileId).toBeNull();
    await expect(secrets.get(a.id)).resolves.toBeNull();
    await expect(secrets.get(b.id)).resolves.toBeNull();
    expect(store.exportSettings()).not.toContain(SECRET_A);
  });

  it('counters reset on the first day of a new month (local time)', async () => {
    const { store, setNow } = makeStore(new Date(2026, 9, 31, 23).getTime()); // Oct 31
    const a = await store.add('A', SECRET_A);
    store.markUsed(a.id);
    store.markUsed(a.id);
    expect(store.view().profiles[0].monthlyCount).toBe(2);
    setNow(new Date(2026, 10, 1, 1).getTime()); // Nov 1
    expect(store.view().profiles[0].monthlyCount).toBe(0);
    store.markUsed(a.id);
    expect(store.view().profiles[0].monthlyCount).toBe(1);
    expect(store.view().profiles[0].status).toBe('valid');
    expect(store.view().profiles[0].lastUsedAt).toBe(new Date(2026, 10, 1, 1).getTime());
  });

  it('exportSettings() contains metadata only — never a secret', async () => {
    const { store } = makeStore();
    await store.add('A', SECRET_A);
    await store.add('B', SECRET_B);
    const exported = JSON.stringify(store.exportSettings());
    expect(exported).not.toContain(SECRET_A);
    expect(exported).not.toContain(SECRET_B);
    expect(exported).toContain('1111'); // last4 is allowed
    expect(store.exportSettings().app).toBe('KBMK');
  });

  it('fallback order: nextInFallback walks the stored order', async () => {
    const { store } = makeStore();
    const a = await store.add('A', SECRET_A);
    const b = await store.add('B', SECRET_B);
    const c = await store.add('C', SECRET_C);
    expect(store.nextInFallback(a.id)?.id).toBe(b.id);
    expect(store.nextInFallback(b.id)?.id).toBe(c.id);
    expect(store.nextInFallback(c.id)).toBeNull();
    store.setFallback(true, [c.id, a.id, b.id]);
    expect(store.nextInFallback(c.id)?.id).toBe(a.id);
  });
});

describe('ProfileRouter', () => {
  it('uses the active profile key, counts usage, keeps the secret out of results', async () => {
    const { store } = makeStore();
    const a = await store.add('Mine', SECRET_A);
    const router = new ProfileRouter({ store, googleFactory: providerReturning('hola') });
    const result = await router.attempt('hello', 'en', 'es');
    expect(result).toMatchObject({ text: `hola via 1111`, profileLabel: 'Mine' });
    expect(JSON.stringify(result)).not.toContain(SECRET_A);
    expect(store.view().profiles[0].monthlyCount).toBe(1);
    expect(store.view().profiles[0].id).toBe(a.id);
  });

  it('AuthError marks the profile invalid and is not retried or fallen back', async () => {
    const { store } = makeStore();
    await store.add('A', SECRET_A);
    await store.add('B', SECRET_B);
    store.setFallback(true);
    let calls = 0;
    const router = new ProfileRouter({
      store,
      googleFactory: () => ({
        id: 'google',
        translate: async () => {
          calls++;
          throw new AuthError();
        },
      }),
    });
    await expect(router.attempt('x', 'en', 'es')).rejects.toBeInstanceOf(AuthError);
    expect(calls).toBe(1);
    expect(store.view().profiles[0].status).toBe('invalid');
  });

  it('QuotaError with fallback ON: retries once with the next key, switches active, reports the switch', async () => {
    const { store } = makeStore();
    const a = await store.add("Rafi's key", SECRET_A);
    const b = await store.add('Backup', SECRET_B);
    store.setActive(a.id);
    store.setFallback(true);
    const switches: Array<[string, string]> = [];
    const router = new ProfileRouter({
      store,
      googleFactory: (key) => ({
        id: 'google',
        translate: async () => {
          if (key === SECRET_A) throw new QuotaError();
          return 'hola';
        },
      }),
      onSwitched: (to, from) => switches.push([to, from]),
    });
    const result = await router.attempt('hello', 'en', 'es');
    expect(result).toMatchObject({ text: 'hola', profileLabel: 'Backup', switchedFromLabel: "Rafi's key" });
    expect(store.view().activeProfileId).toBe(b.id);
    expect(store.view().profiles.find((p) => p.id === a.id)?.status).toBe('quota');
    expect(store.view().profiles.find((p) => p.id === b.id)?.monthlyCount).toBe(1);
    expect(switches).toEqual([['Backup', "Rafi's key"]]);
  });

  it('QuotaError with fallback OFF: throws and marks quota, active unchanged', async () => {
    const { store } = makeStore();
    const a = await store.add('A', SECRET_A);
    await store.add('B', SECRET_B);
    const router = new ProfileRouter({
      store,
      googleFactory: () => ({
        id: 'google',
        translate: async () => {
          throw new QuotaError();
        },
      }),
    });
    await expect(router.attempt('x', 'en', 'es')).rejects.toBeInstanceOf(QuotaError);
    expect(store.view().activeProfileId).toBe(a.id);
    expect(store.view().profiles[0].status).toBe('quota');
  });

  it('no profile in Google mode throws NoProfileError; GTX mode needs no key', async () => {
    const { store } = makeStore();
    const router = new ProfileRouter({ store });
    await expect(router.attempt('x', 'en', 'es')).rejects.toMatchObject({ kind: 'no-profile' });
    store.setProviderMode('gtx');
    const gtxRouter = new ProfileRouter({
      store,
      gtxProvider: { id: 'gtx', translate: async (t) => `gtx:${t}` },
    });
    await expect(gtxRouter.attempt('hello', 'en', 'es')).resolves.toMatchObject({
      text: 'gtx:hello',
      providerId: 'gtx',
    });
  });

  it('testProfile records valid / invalid from the connection test', async () => {
    const { store } = makeStore();
    const a = await store.add('A', SECRET_A);
    const okRouter = new ProfileRouter({
      store,
      googleFactory: () => ({
        id: 'google',
        translate: async () => 'x',
        testConnection: async () => undefined,
      }),
    });
    await expect(okRouter.testProfile(a.id)).resolves.toBe('valid');
    expect(store.view().profiles[0].status).toBe('valid');

    const badRouter = new ProfileRouter({
      store,
      googleFactory: () => ({
        id: 'google',
        translate: async () => 'x',
        testConnection: async () => {
          throw new AuthError();
        },
      }),
    });
    await expect(badRouter.testProfile(a.id)).resolves.toBe('invalid');
    expect(store.view().profiles[0].status).toBe('invalid');
  });
});

describe('secret hygiene scan', () => {
  it('no secret appears in the kv store, the view, exports, or simulated logs', async () => {
    const { store, kv } = makeStore();
    const logs: string[] = [];
    await store.add("Rafi's key", SECRET_A);
    const router = new ProfileRouter({
      store,
      googleFactory: () => ({
        id: 'google',
        translate: async () => {
          throw new QuotaError('Google Translate quota reached (HTTP 403, dailyLimitExceeded)');
        },
      }),
    });
    const error = await router.attempt('hello', 'en', 'es').catch((e: Error) => e);
    logs.push(`attempt failed: ${error.message}`);
    logs.push(JSON.stringify(store.view()));
    const haystacks = [
      JSON.stringify([...kv.data.entries()]),
      JSON.stringify(store.view()),
      JSON.stringify(store.exportSettings()),
      logs.join('\n'),
    ];
    for (const haystack of haystacks) {
      expect(haystack).not.toContain(SECRET_A);
      expect(haystack).not.toContain('AIza-SECRET');
    }
    // …while the renderer payload DOES carry what it is allowed to see.
    expect(JSON.stringify(store.view())).toContain('"last4":"1111"');
  });
});
