import { randomUUID } from 'node:crypto';
import type {
  KeyProfileMeta,
  ProfileStatus,
  ProfilesView,
  ProviderKind,
  ProviderMode,
} from '../shared/types';
import type { KeyValueStore } from './KeyValueStore';
import type { SecretStore } from './SecretStore';
import {
  secretStoreFixHint,
  secretStoreName,
  secretStoreUnavailableMessage,
} from '../shared/secretStoreInfo';

interface StoredState {
  profiles: Array<KeyProfileMeta & { counterMonth: string }>;
  activeProfileId: string | null;
  fallbackEnabled: boolean;
  fallbackOrder: string[];
  providerMode: ProviderMode;
}

const STORE_KEY = 'keyProfiles.v1';

const EMPTY: StoredState = {
  profiles: [],
  activeProfileId: null,
  fallbackEnabled: false,
  fallbackOrder: [],
  providerMode: 'google',
};

export interface ProfileStoreDeps {
  now?: () => number;
  idGen?: () => string;
}

/**
 * Key profiles (M3 design from the user): metadata + counters live in the
 * key/value store (electron-store in the app); the secret itself is only
 * ever written to the SecretStore (keytar) and is never read back into
 * metadata, views, exports, or logs.
 */
export class ProfileStore {
  private readonly kv: KeyValueStore;
  private readonly secrets: SecretStore;
  private readonly now: () => number;
  private readonly idGen: () => string;

  constructor(kv: KeyValueStore, secrets: SecretStore, deps: ProfileStoreDeps = {}) {
    this.kv = kv;
    this.secrets = secrets;
    this.now = deps.now ?? (() => Date.now());
    this.idGen = deps.idGen ?? (() => randomUUID());
  }

  get keyStoreAvailable(): boolean {
    return this.secrets.available;
  }

  private monthKey(timeMs: number): string {
    const d = new Date(timeMs);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  private read(): StoredState {
    const raw = this.kv.get<StoredState>(STORE_KEY);
    const state: StoredState = raw
      ? { ...structuredClone(EMPTY), ...structuredClone(raw) }
      : structuredClone(EMPTY);
    // Monthly counters reset on the first day of each month (local time):
    // lazily roll any profile whose counter belongs to an older month.
    const current = this.monthKey(this.now());
    let changed = false;
    for (const p of state.profiles) {
      // Profiles stored before M4.3 predate per-key providers: Google.
      if (!p.provider) {
        p.provider = 'google';
        changed = true;
      }
      if (p.counterMonth !== current) {
        p.monthlyCount = 0;
        p.counterMonth = current;
        changed = true;
      }
    }
    if (changed) this.write(state);
    return state;
  }

  private write(state: StoredState): void {
    this.kv.set(STORE_KEY, state);
  }

  async add(
    label: string,
    secret: string,
    options: { provider?: ProviderKind; region?: string } = {},
  ): Promise<KeyProfileMeta> {
    const cleanLabel = label.trim();
    const cleanSecret = secret.trim();
    if (!cleanLabel) throw new Error('Give the key a label first.');
    if (!cleanSecret) throw new Error('Paste the API key first.');
    const provider: ProviderKind =
      options.provider === 'azure' || options.provider === 'deepl'
        ? options.provider
        : 'google';
    const region = options.region?.trim();
    if (provider === 'azure' && !region) {
      throw new Error(
        'Azure keys need their region too (Azure portal → your Translator resource → Keys and Endpoint → Location/region).',
      );
    }
    if (!this.secrets.available) {
      throw new Error(secretStoreUnavailableMessage(this.secrets.platform));
    }
    const state = this.read();
    const id = this.idGen();
    await this.secrets.set(id, cleanSecret);
    const meta: StoredState['profiles'][number] = {
      id,
      label: cleanLabel,
      provider,
      ...(provider === 'azure' ? { region } : {}),
      createdAt: this.now(),
      lastUsedAt: null,
      monthlyCount: 0,
      counterMonth: this.monthKey(this.now()),
      status: 'unknown',
      last4: cleanSecret.slice(-4),
    };
    state.profiles.push(meta);
    state.fallbackOrder.push(id);
    if (state.activeProfileId === null) state.activeProfileId = id;
    this.write(state);
    return this.toMeta(meta);
  }

  async remove(id: string): Promise<void> {
    const state = this.read();
    state.profiles = state.profiles.filter((p) => p.id !== id);
    state.fallbackOrder = state.fallbackOrder.filter((x) => x !== id);
    if (state.activeProfileId === id) {
      state.activeProfileId = state.profiles[0]?.id ?? null;
    }
    this.write(state);
    if (this.secrets.available) await this.secrets.delete(id);
  }

  /** Factory reset (M6.1): every profile's secret is deleted from the
   *  credential store and all profile metadata returns to empty. */
  async removeAll(): Promise<void> {
    const state = this.read();
    if (this.secrets.available) {
      for (const profile of state.profiles) {
        await this.secrets.delete(profile.id);
      }
    }
    this.write(structuredClone(EMPTY));
  }

  rename(id: string, label: string): void {
    const clean = label.trim();
    if (!clean) throw new Error('The label cannot be empty.');
    const state = this.read();
    const profile = state.profiles.find((p) => p.id === id);
    if (!profile) throw new Error('Profile not found.');
    profile.label = clean;
    this.write(state);
  }

  setActive(id: string): void {
    const state = this.read();
    if (!state.profiles.some((p) => p.id === id)) throw new Error('Profile not found.');
    state.activeProfileId = id;
    this.write(state);
  }

  setStatus(id: string, status: ProfileStatus): void {
    const state = this.read();
    const profile = state.profiles.find((p) => p.id === id);
    if (!profile) return;
    profile.status = status;
    this.write(state);
  }

  /** Record one successful API translation against a profile. */
  markUsed(id: string): void {
    const state = this.read();
    const profile = state.profiles.find((p) => p.id === id);
    if (!profile) return;
    profile.monthlyCount += 1;
    profile.lastUsedAt = this.now();
    profile.status = 'valid';
    this.write(state);
  }

  setFallback(enabled: boolean, order?: string[]): void {
    const state = this.read();
    state.fallbackEnabled = enabled;
    if (order) {
      const valid = order.filter((id) => state.profiles.some((p) => p.id === id));
      for (const p of state.profiles) if (!valid.includes(p.id)) valid.push(p.id);
      state.fallbackOrder = valid;
    }
    this.write(state);
  }

  setProviderMode(mode: ProviderMode): void {
    const state = this.read();
    state.providerMode = mode;
    this.write(state);
  }

  getProviderMode(): ProviderMode {
    return this.read().providerMode;
  }

  isFallbackEnabled(): boolean {
    return this.read().fallbackEnabled;
  }

  activeProfile(): KeyProfileMeta | null {
    const state = this.read();
    const found = state.profiles.find((p) => p.id === state.activeProfileId);
    return found ? this.toMeta(found) : null;
  }

  /** The next profile after `afterId` in the fallback order, or null. */
  nextInFallback(afterId: string): KeyProfileMeta | null {
    const state = this.read();
    const order = state.fallbackOrder.filter((id) =>
      state.profiles.some((p) => p.id === id),
    );
    const idx = order.indexOf(afterId);
    if (idx === -1) return null;
    const nextId = order[idx + 1];
    const found = state.profiles.find((p) => p.id === nextId);
    return found ? this.toMeta(found) : null;
  }

  /** Main-process only: fetch a profile's secret from the SecretStore. */
  async getSecret(id: string): Promise<string | null> {
    if (!this.secrets.available) return null;
    return this.secrets.get(id);
  }

  private toMeta(p: StoredState['profiles'][number]): KeyProfileMeta {
    const { counterMonth: _ignored, ...meta } = p;
    return meta;
  }

  /** Everything the renderer may see. Contains no secrets, by construction. */
  view(): ProfilesView {
    const state = this.read();
    return {
      profiles: state.profiles.map((p) => ({
        ...this.toMeta(p),
        isActive: p.id === state.activeProfileId,
      })),
      activeProfileId: state.activeProfileId,
      fallbackEnabled: state.fallbackEnabled,
      fallbackOrder: [...state.fallbackOrder],
      providerMode: state.providerMode,
      keyStoreAvailable: this.secrets.available,
      keyStoreName: secretStoreName(this.secrets.platform),
      keyStoreHint: secretStoreFixHint(this.secrets.platform),
    };
  }

  /** Exportable settings snapshot. NEVER includes secrets. */
  exportSettings(): Record<string, unknown> {
    const view = this.view();
    return {
      app: 'KBMK',
      exportedAt: new Date(this.now()).toISOString(),
      providerMode: view.providerMode,
      fallbackEnabled: view.fallbackEnabled,
      fallbackOrder: view.fallbackOrder,
      activeProfileId: view.activeProfileId,
      profiles: view.profiles.map((p) => ({
        id: p.id,
        label: p.label,
        provider: p.provider,
        ...(p.region ? { region: p.region } : {}),
        createdAt: p.createdAt,
        lastUsedAt: p.lastUsedAt,
        monthlyCount: p.monthlyCount,
        status: p.status,
        last4: p.last4,
      })),
    };
  }
}
