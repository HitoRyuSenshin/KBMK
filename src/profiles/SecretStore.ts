/**
 * Secret storage. The ONLY implementation that touches a real key is
 * KeytarSecretStore, backed by the operating system's secret store via
 * keytar (service "KBMK", account = profile id): Windows Credential
 * Manager on Windows, the Keychain on macOS, and a Secret Service
 * keyring on Linux. Secrets never touch electron-store, disk files,
 * logs, or the renderer.
 *
 * M6.4: error messages name the platform's actual store and carry the
 * platform's repair hint (see shared/secretStoreInfo). On Linux keytar
 * can also LOAD but fail at call time when no Secret Service daemon is
 * running, so native call failures are wrapped in the same friendly,
 * platform-correct message instead of leaking a raw D-Bus error.
 */
import {
  secretStoreAccessFailedMessage,
  secretStoreName,
} from '../shared/secretStoreInfo';

export interface SecretStore {
  readonly available: boolean;
  /** Node-style platform id ('win32' | 'darwin' | 'linux' | …). */
  readonly platform: string;
  get(id: string): Promise<string | null>;
  set(id: string, secret: string): Promise<void>;
  delete(id: string): Promise<void>;
}

export const KEYTAR_SERVICE = 'KBMK';

export interface KeytarShape {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
}

export class KeytarSecretStore implements SecretStore {
  available = false;
  readonly platform: string;
  private mod: KeytarShape | null = null;

  /** `modOverride` exists so unit tests can inject a fake keytar module. */
  constructor(modOverride?: KeytarShape, platform: string = process.platform) {
    this.platform = platform;
    try {
      const mod =
        modOverride ??
        // Lazy + guarded: keytar is an optional dependency with a native
        // binary; if it cannot load, profiles report the key store as
        // unavailable instead of breaking the app or the install.
        (require('keytar') as KeytarShape);
      if (mod && typeof mod.getPassword === 'function') {
        this.mod = mod;
        this.available = true;
      }
    } catch {
      this.available = false;
    }
  }

  private requireMod(): KeytarShape {
    if (!this.mod) {
      throw new Error(
        `Secure key storage (${secretStoreName(this.platform)}) is unavailable on this device.`,
      );
    }
    return this.mod;
  }

  /** Native store calls fail as a group (e.g. no keyring daemon): wrap. */
  private accessFailed(): Error {
    return new Error(secretStoreAccessFailedMessage(this.platform));
  }

  async get(id: string): Promise<string | null> {
    const mod = this.requireMod();
    try {
      return await mod.getPassword(KEYTAR_SERVICE, id);
    } catch {
      throw this.accessFailed();
    }
  }

  async set(id: string, secret: string): Promise<void> {
    const mod = this.requireMod();
    try {
      await mod.setPassword(KEYTAR_SERVICE, id, secret);
    } catch {
      throw this.accessFailed();
    }
  }

  async delete(id: string): Promise<void> {
    const mod = this.requireMod();
    try {
      await mod.deletePassword(KEYTAR_SERVICE, id);
    } catch {
      throw this.accessFailed();
    }
  }
}

/** In-memory fake for unit tests. */
export class FakeSecretStore implements SecretStore {
  readonly available = true;
  readonly platform: string = process.platform;
  readonly map = new Map<string, string>();

  async get(id: string): Promise<string | null> {
    return this.map.get(id) ?? null;
  }
  async set(id: string, secret: string): Promise<void> {
    this.map.set(id, secret);
  }
  async delete(id: string): Promise<void> {
    this.map.delete(id);
  }
}
