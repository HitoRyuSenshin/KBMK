/**
 * Minimal key/value interface for NON-SECRET metadata. In the app this is
 * backed by electron-store; in tests by the in-memory implementation.
 */
export interface KeyValueStore {
  get<T>(key: string): T | undefined;
  set(key: string, value: unknown): void;
  delete(key: string): void;
}

export class MemoryKeyValueStore implements KeyValueStore {
  readonly data = new Map<string, unknown>();

  get<T>(key: string): T | undefined {
    return this.data.get(key) as T | undefined;
  }
  set(key: string, value: unknown): void {
    this.data.set(key, value);
  }
  delete(key: string): void {
    this.data.delete(key);
  }
}

/** Adapter over an electron-store instance (created in the main process). */
export class ElectronStoreKeyValueStore implements KeyValueStore {
  private readonly store: {
    get(key: string): unknown;
    set(key: string, value: unknown): void;
    delete(key: string): void;
  };

  constructor(store: {
    get(key: string): unknown;
    set(key: string, value: unknown): void;
    delete(key: string): void;
  }) {
    this.store = store;
  }

  get<T>(key: string): T | undefined {
    return this.store.get(key) as T | undefined;
  }
  set(key: string, value: unknown): void {
    this.store.set(key, value);
  }
  delete(key: string): void {
    this.store.delete(key);
  }
}
