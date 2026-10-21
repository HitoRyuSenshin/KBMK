import { contextBridge, ipcRenderer } from 'electron';
import type { AppState } from '../shared/types';
import type { KbmkApi } from './types';

/**
 * IMPORTANT: this preload runs in Electron's sandboxed renderer, where
 * `require` only works for a small allowlist of built-in modules. A runtime
 * import of a relative file (e.g. the IPC constants from ../shared/types)
 * throws while the preload loads, contextBridge never runs, and
 * window.kbmk ends up undefined — which is why the M1 language dropdown
 * rendered but the window never expanded to show it.
 *
 * Therefore this file must stay self-contained: type-only imports (erased
 * at compile time) plus the channel names as literals. The literals must
 * match IPC in src/shared/types.ts exactly — tests/preload.test.ts checks
 * that they do not drift apart.
 */
const CH = {
  getState: 'kbmk:get-state',
  setEnabled: 'kbmk:set-enabled',
  setLanguages: 'kbmk:set-languages',
  swapLanguages: 'kbmk:swap-languages',
  openSettings: 'kbmk:open-settings',
  setExpanded: 'kbmk:set-expanded',
  setPillWidth: 'kbmk:set-pill-width',
  stateChanged: 'kbmk:state-changed',
  hidePill: 'kbmk:hide-pill',
  profilesView: 'kbmk:profiles-view',
  profilesAdd: 'kbmk:profiles-add',
  profilesRemove: 'kbmk:profiles-remove',
  profilesRename: 'kbmk:profiles-rename',
  profilesSetActive: 'kbmk:profiles-set-active',
  profilesTest: 'kbmk:profiles-test',
  profilesSetFallback: 'kbmk:profiles-set-fallback',
  profilesSetProviderMode: 'kbmk:profiles-set-provider-mode',
  profilesExport: 'kbmk:profiles-export',
  openWindows: 'kbmk:get-open-windows',
  windowClose: 'kbmk:window-close',
  windowMinimize: 'kbmk:window-minimize',
  preferencesSetAccent: 'kbmk:set-accent',
  preferencesSetOpacity: 'kbmk:set-opacity',
  preferencesSetSentenceOffers: 'kbmk:set-sentence-offers',
  resetAll: 'kbmk:reset-all',
  preferencesGet: 'kbmk:get-preferences',
  preferencesSetBlockList: 'kbmk:set-block-list',
  preferencesSetLaunchAtLogin: 'kbmk:set-launch-at-login',
  languages: 'kbmk:get-languages',
} as const;

const api: KbmkApi = {
  getState: () => ipcRenderer.invoke(CH.getState),
  setEnabled: (enabled: boolean) => ipcRenderer.invoke(CH.setEnabled, enabled),
  setLanguages: (source: string, target: string) =>
    ipcRenderer.invoke(CH.setLanguages, source, target),
  swapLanguages: () => ipcRenderer.invoke(CH.swapLanguages),
  openSettings: () => ipcRenderer.invoke(CH.openSettings),
  setExpanded: (expanded: boolean, height?: number) =>
    ipcRenderer.invoke(CH.setExpanded, expanded, height),
  setPillWidth: (width: number) => ipcRenderer.invoke(CH.setPillWidth, width),
  hidePill: () => ipcRenderer.invoke(CH.hidePill),
  onStateChanged: (callback: (state: AppState) => void) => {
    const listener = (_event: unknown, state: AppState) => callback(state);
    ipcRenderer.on(CH.stateChanged, listener as never);
    return () => ipcRenderer.removeListener(CH.stateChanged, listener as never);
  },
  getProfilesView: () => ipcRenderer.invoke(CH.profilesView),
  addProfile: (label: string, secret: string, provider?: string, region?: string) =>
    ipcRenderer.invoke(CH.profilesAdd, label, secret, provider, region),
  removeProfile: (id: string) => ipcRenderer.invoke(CH.profilesRemove, id),
  renameProfile: (id: string, label: string) =>
    ipcRenderer.invoke(CH.profilesRename, id, label),
  setActiveProfile: (id: string) => ipcRenderer.invoke(CH.profilesSetActive, id),
  testProfile: (id: string) => ipcRenderer.invoke(CH.profilesTest, id),
  setKeyFallback: (enabled: boolean, order: string[]) =>
    ipcRenderer.invoke(CH.profilesSetFallback, enabled, order),
  setProviderMode: (mode: string) => ipcRenderer.invoke(CH.profilesSetProviderMode, mode),
  exportSettings: () => ipcRenderer.invoke(CH.profilesExport),
  getLanguages: () => ipcRenderer.invoke(CH.languages),
  getPreferences: () => ipcRenderer.invoke(CH.preferencesGet),
  setBlockList: (list: string[]) => ipcRenderer.invoke(CH.preferencesSetBlockList, list),
  setLaunchAtLogin: (enabled: boolean) =>
    ipcRenderer.invoke(CH.preferencesSetLaunchAtLogin, enabled),
  getOpenWindows: () => ipcRenderer.invoke(CH.openWindows),
  closeWindow: () => ipcRenderer.invoke(CH.windowClose),
  minimizeWindow: () => ipcRenderer.invoke(CH.windowMinimize),
  setAccent: (hex: string) => ipcRenderer.invoke(CH.preferencesSetAccent, hex),
  setOpacity: (value: number) => ipcRenderer.invoke(CH.preferencesSetOpacity, value),
  setSentenceOffers: (enabled: boolean) =>
    ipcRenderer.invoke(CH.preferencesSetSentenceOffers, enabled),
  resetAll: () => ipcRenderer.invoke(CH.resetAll),
};

contextBridge.exposeInMainWorld('kbmk', api);
