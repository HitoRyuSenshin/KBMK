import { processNameFromPath } from '../settings/blockList';

/**
 * Which app is in the foreground (Windows only), via the same koffi
 * FFI the hooks use. The process name is resolved when the foreground
 * window changes (HWND cached), so calling this on every keystroke
 * costs one GetForegroundWindow call.
 *
 * FFI idiom note: out-parameters are declared 'void *' and backed by
 * Buffers — the exact pattern the (working) keyboard hook uses for
 * ToUnicodeEx. Typed primitive pointers ('uint32 *') are NOT used:
 * with them the pid never landed in the buffer, every resolve quietly
 * returned null, and the block list silently never enforced (M5.3 fix).
 *
 * Returns null off Windows or on failure — callers treat null as
 * "unknown", never as "blocked" — but the first failure is logged, so
 * a dead tracker is visible in the console instead of silent.
 */
export class ForegroundAppTracker {
  private hwnd: unknown = null;
  private name: string | null = null;
  private lastResolveAt = 0;
  private errorLogged = false;
  private fns: {
    getForegroundWindow: () => unknown;
    getWindowThreadProcessId: (hwnd: unknown, out: Buffer | null) => number;
    openProcess: (access: number, inherit: boolean, pid: number) => unknown;
    queryFullProcessImageName: (handle: unknown, flags: number, buffer: Buffer, sizePtr: Buffer) => boolean;
    closeHandle: (handle: unknown) => boolean;
  } | null = null;

  constructor() {
    if (process.platform !== 'win32') return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const koffi = require('koffi');
      const user32 = koffi.load('user32.dll');
      const kernel32 = koffi.load('kernel32.dll');
      this.fns = {
        getForegroundWindow: user32.func('GetForegroundWindow', 'void *', []),
        getWindowThreadProcessId: user32.func('GetWindowThreadProcessId', 'uint32', [
          'void *',
          'void *',
        ]),
        openProcess: kernel32.func('OpenProcess', 'void *', ['uint32', 'bool', 'uint32']),
        queryFullProcessImageName: kernel32.func('QueryFullProcessImageNameW', 'bool', [
          'void *',
          'uint32',
          'void *',
          'void *',
        ]),
        closeHandle: kernel32.func('CloseHandle', 'bool', ['void *']),
      };
    } catch {
      this.fns = null;
    }
  }

  get available(): boolean {
    return this.fns !== null;
  }

  private noteError(error: unknown): void {
    if (this.errorLogged) return;
    this.errorLogged = true;
    console.error(
      '[KBMK] foreground tracking error (block list may not enforce):',
      error instanceof Error ? error.message : error,
    );
  }

  /** Current foreground process name, lower-cased ("notepad.exe"), or null. */
  currentApp(): string | null {
    if (!this.fns) return null;
    try {
      const hwnd = this.fns.getForegroundWindow();
      if (!hwnd) return null;
      if (hwnd !== this.hwnd) {
        // A definite switch: resolve now, never serve the previous
        // app's name to the block check.
        this.hwnd = hwnd;
        this.lastResolveAt = Date.now();
        this.name = this.resolve(hwnd);
        return this.name;
      }
      // Same handle (or handles koffi won't compare equal): re-resolve
      // at most every 250 ms so a missed switch still lands quickly.
      const nowMs = Date.now();
      if (nowMs - this.lastResolveAt >= 250) {
        this.lastResolveAt = nowMs;
        this.name = this.resolve(hwnd);
      }
      return this.name;
    } catch (error) {
      this.noteError(error);
      return null;
    }
  }

  private resolve(hwnd: unknown): string | null {
    if (!this.fns) return null;
    const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
    const pidBuf = Buffer.alloc(4);
    this.fns.getWindowThreadProcessId(hwnd, pidBuf);
    const pid = pidBuf.readUInt32LE(0);
    if (!pid) return null;
    const handle = this.fns.openProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
    if (!handle) return null;
    try {
      const buffer = Buffer.alloc(1024);
      const sizeBuf = Buffer.alloc(4);
      sizeBuf.writeUInt32LE(512, 0); // WCHAR count
      const ok = this.fns.queryFullProcessImageName(handle, 0, buffer, sizeBuf);
      if (!ok) return null;
      const length = sizeBuf.readUInt32LE(0);
      const path = buffer.toString('utf16le', 0, length * 2);
      return processNameFromPath(path) || null;
    } finally {
      this.fns.closeHandle(handle);
    }
  }
}
