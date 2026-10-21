import { Menu, Tray, app, nativeImage } from 'electron';
import { join } from 'node:path';

export interface TrayActions {
  onShowHide(): void;
  onTogglePause(): void;
  onSettings(): void;
  onQuit(): void;
  isEnabled(): boolean;
  isVisible(): boolean;
}

let tray: Tray | null = null;

export function createTray(actions: TrayActions): Tray {
  // The app icon (M5.7): a red glass speech bubble with "ক". On Windows
  // the multi-size .ico lets the tray pick the crispest size (16–256px);
  // elsewhere (and as fallback) the 256px PNG is used.
  const assetsDir = join(__dirname, '../../assets');
  let image = nativeImage.createFromPath(
    join(assetsDir, process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
  );
  if (image.isEmpty()) image = nativeImage.createFromPath(join(assetsDir, 'icon.png'));
  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
  tray.setToolTip('KBMK — translation widget');

  const rebuild = () => {
    if (!tray) return;
    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: actions.isVisible() ? 'Hide' : 'Show',
          click: () => {
            actions.onShowHide();
            rebuild();
          },
        },
        {
          label: actions.isEnabled() ? 'Pause' : 'Resume',
          click: () => {
            actions.onTogglePause();
            rebuild();
          },
        },
        { type: 'separator' },
        { label: 'Settings', click: () => actions.onSettings() },
        { type: 'separator' },
        { label: 'Quit', click: () => actions.onQuit() },
      ]),
    );
  };

  rebuild();
  tray.on('click', () => {
    actions.onShowHide();
    rebuild();
  });
  app.on('before-quit', () => {
    tray?.destroy();
    tray = null;
  });
  return tray;
}

/** Call after state changes made elsewhere (e.g. from the pill) so Pause/Resume label stays right. */
export function refreshTray(): void {
  // The menu is rebuilt on click; labels are also refreshed on the next
  // tray interaction. Kept as a named hook for M5's hotkey-driven changes.
}
