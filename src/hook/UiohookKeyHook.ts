import type { KeyHook, KeyEventLike } from './KeyHook';
import { formatRawKey, mapUiohookKey, type RawKey } from './keymap';

/**
 * Real global hook backed by uiohook-napi (M2).
 *
 * The native module is loaded lazily inside start() so that a machine
 * where the prebuild cannot load still gets a working pill + tray, with
 * the hook reported unavailable instead of crashing the app.
 * This class only ever *observes* keys — it never blocks or alters them.
 * Windows behaviour: needs user test.
 */
interface UiohookModuleShape {
  uIOhook: {
    on(event: 'keydown', listener: (e: RawKey & { type: number }) => void): void;
    on(
      event: 'mousedown',
      listener: (e: { button: number; x: number; y: number }) => void,
    ): void;
    start(): void;
    stop(): void;
  };
}

export class UiohookKeyHook implements KeyHook {
  private handler: ((event: KeyEventLike) => void) | null = null;
  private injecting = false;
  private native: UiohookModuleShape['uIOhook'] | null = null;
  private readonly onError: (error: unknown) => void;
  private readonly debugRaw: ((line: string) => void) | null;
  private readonly keysEnabled: boolean;

  constructor(
    onError: (error: unknown) => void = () => undefined,
    debugRaw: ((line: string) => void) | null = null,
    options: { keysEnabled?: boolean } = {},
  ) {
    this.onError = onError;
    this.debugRaw = debugRaw;
    this.keysEnabled = options.keysEnabled ?? true;
  }

  start(onEvent: (event: KeyEventLike) => void): void {
    this.handler = onEvent;
    try {
      // Lazy require: see class comment. uiohook-napi ships prebuilds for
      // win32-x64 and win32-arm64 (verified in the 1.5.5 package).
      const mod = require('uiohook-napi') as UiohookModuleShape;
      this.native = mod.uIOhook;
      if (this.keysEnabled) {
        this.native.on('keydown', (e) => {
          if (this.injecting) return; // never react to our own output (M4)
          this.debugRaw?.(formatRawKey(e));
          const mapped = mapUiohookKey(e);
          if (mapped) this.handler?.(mapped);
        });
      }
      this.native.on('mousedown', (e) => {
        if (this.injecting) return;
        // A click usually means a new field/app: abandon the current
        // word. Button + position ride along (M5.16) so main can spot
        // the right-click → Paste menu gesture.
        this.handler?.({
          type: 'mouse',
          mouse: { button: e.button, x: e.x, y: e.y },
        });
      });
      this.native.start();
    } catch (error) {
      this.native = null;
      this.onError(error);
    }
  }

  stop(): void {
    try {
      this.native?.stop();
    } catch {
      // Stopping must never throw during app quit.
    }
    this.native = null;
    this.handler = null;
  }

  isInjecting(): boolean {
    return this.injecting;
  }

  setInjecting(value: boolean): void {
    this.injecting = value;
  }

  /** uiohook cannot consume keys, so Esc cannot be swallowed on this
   *  path — the flag is recorded only (the Win32 hook is primary). */
  setOfferPending(_value: boolean): void {
    // no-op by design
  }
}
