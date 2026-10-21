import { BrowserWindow } from 'electron';
import { join } from 'node:path';

let settingsWindow: BrowserWindow | null = null;

/**
 * Settings window. M1/M2 showed a placeholder with the privacy notice;
 * M3 added key-profile management; M4.3 added per-key providers (Google /
 * Azure); M5 completed it with app behaviour: launch at login, the
 * per-app block list, and the hotkey reference.
 */
export function openSettingsWindow(): BrowserWindow {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return settingsWindow;
  }

  settingsWindow = new BrowserWindow({
    width: 648,
    height: 680,
    minWidth: 580,
    minHeight: 560,
    // Frameless like the pill (M5.1): no native title bar anywhere in
    // KBMK. The renderer draws its own title bar with a drag region
    // and minimize/close buttons (IPC kbmk:window-minimize/close).
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    title: 'KBMK — Settings',
    icon: join(__dirname, '../../assets/icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const rendererFile = join(__dirname, '../renderer/index.html');
  void settingsWindow.loadFile(rendererFile, { query: { view: 'settings' } });
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
  return settingsWindow;
}
