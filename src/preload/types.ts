import type { AppState, LanguageListResult, OpenWindowInfo, PreferencesView, ProfilesView, ProviderKind, ProviderMode } from '../shared/types';

export interface KbmkApi {
  getState(): Promise<AppState>;
  setEnabled(enabled: boolean): Promise<AppState>;
  setLanguages(source: string, target: string): Promise<AppState>;
  swapLanguages(): Promise<AppState>;
  openSettings(): Promise<void>;
  setExpanded(expanded: boolean, height?: number): Promise<'above' | 'below'>;
  /** Report the pill row's natural width so the window can hug it (M5.13). */
  setPillWidth(width: number): Promise<void>;
  hidePill(): Promise<void>;
  onStateChanged(callback: (state: AppState) => void): () => void;
  /* Key profiles (M3). The renderer only ever sees safe metadata. */
  getProfilesView(): Promise<ProfilesView>;
  addProfile(label: string, secret: string, provider?: ProviderKind, region?: string): Promise<ProfilesView>;
  removeProfile(id: string): Promise<ProfilesView>;
  renameProfile(id: string, label: string): Promise<ProfilesView>;
  setActiveProfile(id: string): Promise<ProfilesView>;
  testProfile(id: string): Promise<ProfilesView>;
  setKeyFallback(enabled: boolean, order: string[]): Promise<ProfilesView>;
  setProviderMode(mode: ProviderMode): Promise<ProfilesView>;
  exportSettings(): Promise<Record<string, unknown>>;
  /** The API-supported language list (cached); empty means use built-in. */
  getLanguages(): Promise<LanguageListResult>;
  /* App behaviour (M5). */
  getPreferences(): Promise<PreferencesView>;
  setBlockList(list: string[]): Promise<PreferencesView>;
  setLaunchAtLogin(enabled: boolean): Promise<PreferencesView>;
  /** Open windows for the block-list picker (Windows only). */
  getOpenWindows(): Promise<OpenWindowInfo[]>;
  /* Frameless window controls (M5.1). */
  closeWindow(): Promise<void>;
  minimizeWindow(): Promise<void>;
  /** Set the glass accent colour (M5.2). */
  setAccent(hex: string): Promise<PreferencesView>;
  /** Set the glass opacity, 0.35–1 (M5.10). */
  setOpacity(value: number): Promise<PreferencesView>;
  /** Turn sentence offers on/off (M7). */
  setSentenceOffers(enabled: boolean): Promise<PreferencesView>;
  /** Factory reset: remove all keys and settings on this PC (M6.1). */
  resetAll(): Promise<PreferencesView>;
}
