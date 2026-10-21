import { GoogleCloudProvider } from '../providers/GoogleCloudProvider';
import { AzureTranslatorProvider } from '../providers/AzureTranslatorProvider';
import { DeepLTranslatorProvider } from '../providers/DeepLTranslatorProvider';
import { UnofficialGtxProvider } from '../providers/UnofficialGtxProvider';
import type { TranslationProvider } from '../providers/TranslationProvider';
import type { KeyProfileMeta } from '../shared/types';
import {
  AuthError,
  NoProfileError,
  QuotaError,
  TranslationError,
} from '../providers/errors';
import type { AttemptResult } from '../providers/TranslationService';
import type { ProfileStore } from './ProfileStore';

export interface ProfileRouterDeps {
  store: ProfileStore;
  /** Factories so tests can inject fake providers per key. */
  googleFactory?: (apiKey: string) => TranslationProvider & {
    testConnection?: () => Promise<void>;
  };
  azureFactory?: (apiKey: string, region: string) => TranslationProvider & {
    testConnection?: () => Promise<void>;
  };
  deeplFactory?: (apiKey: string) => TranslationProvider & {
    testConnection?: () => Promise<void>;
  };
  gtxProvider?: TranslationProvider;
  /** Called when a quota fallback visibly switches the active key. */
  onSwitched?: (toLabel: string, fromLabel: string) => void;
}

/**
 * Chooses which key/provider serves a translation (spec + M3 key-profile
 * design):
 * - Experimental mode: the keyless GTX provider, no profile involved.
 * - Google mode: the active profile's key from keytar. AuthError marks
 *   the profile 'invalid' (no retry). QuotaError marks it 'quota' and —
 *   only if fallback is enabled and another profile exists — retries
 *   ONCE with the next profile in the fallback order, makes it the
 *   active profile, and reports the switch (never silent).
 */
export class ProfileRouter {
  private readonly store: ProfileStore;
  private readonly googleFactory: NonNullable<ProfileRouterDeps['googleFactory']>;
  private readonly azureFactory: NonNullable<ProfileRouterDeps['azureFactory']>;
  private readonly deeplFactory: NonNullable<ProfileRouterDeps['deeplFactory']>;
  private readonly gtx: TranslationProvider;
  private readonly onSwitched?: (toLabel: string, fromLabel: string) => void;

  constructor(deps: ProfileRouterDeps) {
    this.store = deps.store;
    this.googleFactory =
      deps.googleFactory ?? ((key: string) => new GoogleCloudProvider(key));
    this.azureFactory =
      deps.azureFactory ??
      ((key: string, region: string) => new AzureTranslatorProvider(key, region));
    this.deeplFactory =
      deps.deeplFactory ?? ((key: string) => new DeepLTranslatorProvider(key));
    this.gtx = deps.gtxProvider ?? new UnofficialGtxProvider();
    this.onSwitched = deps.onSwitched;
  }

  /** Build the provider for a profile (Google, Azure or DeepL, per the key). */
  private buildProvider(
    profile: KeyProfileMeta,
    secret: string,
  ): TranslationProvider & { testConnection?: () => Promise<void> } {
    if (profile.provider === 'azure') return this.azureFactory(secret, profile.region ?? '');
    if (profile.provider === 'deepl') return this.deeplFactory(secret);
    return this.googleFactory(secret);
  }

  private async providerFor(
    profile: KeyProfileMeta,
  ): Promise<TranslationProvider & { testConnection?: () => Promise<void> }> {
    const secret = await this.store.getSecret(profile.id);
    if (!secret) {
      throw new AuthError(`No key is stored for the profile "${profile.label}"`);
    }
    return this.buildProvider(profile, secret);
  }

  async attempt(text: string, from: string, to: string): Promise<AttemptResult> {
    if (this.store.getProviderMode() === 'gtx') {
      const translated = await this.gtx.translate(text, from, to);
      return { text: translated, providerId: this.gtx.id };
    }

    const profile = this.store.activeProfile();
    if (!profile) throw new NoProfileError();
    try {
      return await this.attemptWithProfile(profile.id, profile.label, text, from, to);
    } catch (error) {
      if (error instanceof AuthError) {
        this.store.setStatus(profile.id, 'invalid');
        throw error;
      }
      if (error instanceof QuotaError) {
        this.store.setStatus(profile.id, 'quota');
        if (this.store.isFallbackEnabled()) {
          const next = this.store.nextInFallback(profile.id);
          if (next) return this.attemptFallback(next.id, next.label, profile.label, text, from, to);
        }
      }
      throw error;
    }
  }

  private async attemptFallback(
    id: string,
    label: string,
    fromLabel: string,
    text: string,
    from: string,
    to: string,
  ): Promise<AttemptResult> {
    try {
      const result = await this.attemptWithProfile(id, label, text, from, to);
      this.store.setActive(id);
      this.onSwitched?.(label, fromLabel);
      return { ...result, switchedFromLabel: fromLabel };
    } catch (error) {
      if (error instanceof AuthError) this.store.setStatus(id, 'invalid');
      if (error instanceof QuotaError) this.store.setStatus(id, 'quota');
      throw error;
    }
  }

  private async attemptWithProfile(
    id: string,
    label: string,
    text: string,
    from: string,
    to: string,
  ): Promise<AttemptResult> {
    const meta = this.store.view().profiles.find((p) => p.id === id);
    if (!meta) throw new AuthError(`Profile "${label}" no longer exists`);
    const provider = await this.providerFor(meta);
    const translated = await provider.translate(text, from, to);
    this.store.markUsed(id);
    return {
      text: translated,
      providerId: provider.id,
      profileId: id,
      profileLabel: label,
    };
  }

  /**
   * The active key's supported languages (Google mode only). Returns []
   * when there is nothing to ask — keyless mode, no profile, or a
   * provider without a list — so callers fall back to the built-in
   * list. Failures propagate; the language service decides on fallback.
   */
  async listSupportedLanguages(): Promise<Array<{ code: string; name: string }>> {
    if (this.store.getProviderMode() !== 'google') return [];
    const profile = this.store.activeProfile();
    if (!profile) return [];
    let provider: TranslationProvider & { testConnection?: () => Promise<void> };
    try {
      provider = await this.providerFor(profile);
    } catch {
      return []; // no stored key: nothing to ask
    }
    if (!provider.listLanguages) return [];
    return provider.listLanguages();
  }

  /**
   * The active DeepL key's real character usage (M5.10), or null when
   * the active profile is not DeepL / has no usage endpoint. Used by
   * the pill's usage readout; failures are the caller's to absorb.
   */
  async activeUsageChars(): Promise<{ count: number; limit: number } | null> {
    if (this.store.getProviderMode() !== 'google') return null;
    const profile = this.store.activeProfile();
    if (!profile || profile.provider !== 'deepl') return null;
    let provider: TranslationProvider & { testConnection?: () => Promise<void> };
    try {
      provider = await this.providerFor(profile);
    } catch {
      return null;
    }
    if (!provider.getUsageChars) return null;
    return provider.getUsageChars();
  }

  /**
   * Settings "Test connection": validates a profile's key with the
   * provider's cheap languages call and records the resulting status.
   * Returns the new status. The key never leaves the main process.
   */
  async testProfile(id: string): Promise<'valid' | 'invalid' | 'quota'> {
    const view = this.store.view();
    const profile = view.profiles.find((p) => p.id === id);
    if (!profile) throw new Error('Profile not found.');
    const secret = await this.store.getSecret(id);
    if (!secret) {
      this.store.setStatus(id, 'invalid');
      return 'invalid';
    }
    const provider = this.buildProvider(profile, secret);
    try {
      if (provider.testConnection) await provider.testConnection();
      else await provider.translate('test', 'en', 'es');
      this.store.setStatus(id, 'valid');
      return 'valid';
    } catch (error) {
      if (error instanceof QuotaError) {
        this.store.setStatus(id, 'quota');
        return 'quota';
      }
      if (error instanceof TranslationError && error.kind === 'network') {
        // A network failure says nothing about the key: leave status alone
        // and let the caller report the connectivity problem.
        throw error;
      }
      this.store.setStatus(id, 'invalid');
      return 'invalid';
    }
  }
}
