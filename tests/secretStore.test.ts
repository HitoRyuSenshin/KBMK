import { describe, expect, it } from 'vitest';
import {
  KEYTAR_SERVICE,
  KeytarSecretStore,
  type KeytarShape,
} from '../src/profiles/SecretStore';

/** Fake keytar module keyed by `${service}:${account}`, like the real one. */
function fakeKeytar() {
  const data = new Map<string, string>();
  const mod: KeytarShape = {
    getPassword: async (service, account) => data.get(`${service}:${account}`) ?? null,
    setPassword: async (service, account, password) => {
      data.set(`${service}:${account}`, password);
    },
    deletePassword: async (service, account) => data.delete(`${service}:${account}`),
  };
  return { mod, data };
}

describe('KeytarSecretStore', () => {
  it('uses KBMK as the service name for new secrets', async () => {
    const { mod, data } = fakeKeytar();
    const store = new KeytarSecretStore(mod);
    expect(store.available).toBe(true);
    await store.set('id-1', 'secret-1');
    expect(data.get(`${KEYTAR_SERVICE}:id-1`)).toBe('secret-1');
    expect(KEYTAR_SERVICE).toBe('KBMK');
  });

  it('set/get/delete roundtrip, under the KBMK service only', async () => {
    const { mod, data } = fakeKeytar();
    const store = new KeytarSecretStore(mod);
    await store.set('id-2', 'new');
    await expect(store.get('id-2')).resolves.toBe('new');
    expect([...data.keys()]).toEqual([`${KEYTAR_SERVICE}:id-2`]);
    await store.delete('id-2');
    expect(data.has(`${KEYTAR_SERVICE}:id-2`)).toBe(false);
    await expect(store.get('id-2')).resolves.toBeNull();
  });

  it('a missing keytar module reports unavailable instead of throwing', () => {
    const broken = {} as KeytarShape;
    expect(new KeytarSecretStore(broken).available).toBe(false);
  });
});

describe('KeytarSecretStore platform messages (M6.4)', () => {
  it('an unavailable store names the platform store, not always Credential Manager', async () => {
    const broken = {} as KeytarShape;
    const linux = new KeytarSecretStore(broken, 'linux');
    await expect(linux.get('id-1')).rejects.toThrow(/Secret Service keychain/);
    const win = new KeytarSecretStore(broken, 'win32');
    await expect(win.get('id-1')).rejects.toThrow(/Windows Credential Manager/);
  });

  it('a native call failure (e.g. no keyring daemon) is wrapped with the platform fix hint', async () => {
    const throwing: KeytarShape = {
      getPassword: async () => {
        throw new Error('org.freedesktop.secrets was not provided');
      },
      setPassword: async () => {
        throw new Error('org.freedesktop.secrets was not provided');
      },
      deletePassword: async () => {
        throw new Error('org.freedesktop.secrets was not provided');
      },
    };
    const store = new KeytarSecretStore(throwing, 'linux');
    expect(store.available).toBe(true);
    await expect(store.set('id-1', 's')).rejects.toThrow(/could not be reached/);
    await expect(store.set('id-1', 's')).rejects.toThrow(/gnome-keyring/);
    await expect(store.get('id-1')).rejects.toThrow(/could not be reached/);
    await expect(store.delete('id-1')).rejects.toThrow(/could not be reached/);
    // The raw D-Bus wording never reaches the user.
    await expect(store.set('id-1', 's')).rejects.not.toThrow(/freedesktop/);
  });

  it('exposes the platform it was built for', () => {
    const { mod } = fakeKeytar();
    expect(new KeytarSecretStore(mod, 'darwin').platform).toBe('darwin');
  });
});
