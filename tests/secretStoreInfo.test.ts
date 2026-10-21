import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  secretStoreAccessFailedMessage,
  secretStoreFixHint,
  secretStoreName,
  secretStoreUnavailableMessage,
} from '../src/shared/secretStoreInfo';
import { ProfileStore } from '../src/profiles/ProfileStore';
import { MemoryKeyValueStore } from '../src/profiles/KeyValueStore';
import type { SecretStore } from '../src/profiles/SecretStore';

describe('secretStoreInfo', () => {
  it('names the store each platform actually has', () => {
    expect(secretStoreName('win32')).toBe('Windows Credential Manager');
    expect(secretStoreName('darwin')).toBe('macOS Keychain');
    expect(secretStoreName('linux')).toBe('the Secret Service keychain');
    // Unknown platforms fall back to the Linux-style generic name.
    expect(secretStoreName('freebsd')).toBe('the Secret Service keychain');
  });

  it('gives the repair hint that matches the platform', () => {
    expect(secretStoreFixHint('win32')).toContain('Visual Studio Build Tools');
    expect(secretStoreFixHint('darwin')).toContain('login keychain');
    const linux = secretStoreFixHint('linux');
    expect(linux).toContain('libsecret-1-0');
    expect(linux).toContain('gnome-keyring');
  });

  it('composes full messages from name + hint, never Windows-only text on Linux', () => {
    const unavailable = secretStoreUnavailableMessage('linux');
    expect(unavailable).toContain('the Secret Service keychain');
    expect(unavailable).toContain('libsecret-1-0');
    expect(unavailable).not.toContain('Credential Manager');
    expect(unavailable).not.toContain('Visual Studio');

    const failed = secretStoreAccessFailedMessage('linux');
    expect(failed).toContain('could not be reached');
    expect(failed).not.toContain('Credential Manager');

    expect(secretStoreUnavailableMessage('win32')).toContain(
      'Windows Credential Manager',
    );
    expect(secretStoreUnavailableMessage('darwin')).toContain('macOS Keychain');
  });

  it('source guard: the Windows name lives only in secretStoreInfo + renderer defaults', () => {
    for (const file of [
      'src/profiles/SecretStore.ts',
      'src/profiles/ProfileStore.ts',
      'src/main/main.ts',
    ]) {
      const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
      expect(source, file).not.toContain('Windows Credential Manager');
    }
  });
});

describe('ProfileStore on Linux (M6.4)', () => {
  const unavailableLinuxStore: SecretStore = {
    available: false,
    platform: 'linux',
    get: async () => null,
    set: async () => undefined,
    delete: async () => undefined,
  };

  it('adding a key without a keyring explains the Linux fix, not Credential Manager', async () => {
    const store = new ProfileStore(new MemoryKeyValueStore(), unavailableLinuxStore);
    await expect(store.add('My key', 'secret-value')).rejects.toThrow(
      /Secret Service keychain/,
    );
    await expect(store.add('My key', 'secret-value')).rejects.toThrow(/libsecret/);
    await expect(store.add('My key', 'secret-value')).rejects.not.toThrow(
      /Credential Manager/,
    );
  });

  it('the profiles view carries the platform name + hint for the renderer', () => {
    const store = new ProfileStore(new MemoryKeyValueStore(), unavailableLinuxStore);
    const view = store.view();
    expect(view.keyStoreAvailable).toBe(false);
    expect(view.keyStoreName).toBe('the Secret Service keychain');
    expect(view.keyStoreHint).toContain('gnome-keyring');
  });
});
