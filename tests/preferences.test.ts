import { describe, expect, it } from 'vitest';
import { PreferencesStore } from '../src/settings/PreferencesStore';
import { MemoryKeyValueStore } from '../src/profiles/KeyValueStore';

describe('PreferencesStore sentence offers (M7)', () => {
  it('defaults to on, persists off, and reset restores the default', () => {
    const store = new PreferencesStore(new MemoryKeyValueStore());
    expect(store.sentenceOffers()).toBe(true);
    expect(store.setSentenceOffers(false)).toBe(false);
    expect(store.sentenceOffers()).toBe(false);
    expect(store.setSentenceOffers(true)).toBe(true);
    store.setSentenceOffers(false);
    store.resetAll();
    expect(store.sentenceOffers()).toBe(true);
  });

  it('a stored non-boolean does not turn offers off', () => {
    const kv = new MemoryKeyValueStore();
    kv.set('sentenceOffers.v1', 'no');
    const store = new PreferencesStore(kv);
    expect(store.sentenceOffers()).toBe(true);
  });
});
