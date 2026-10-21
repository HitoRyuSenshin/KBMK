import { processNameFromPath } from '../settings/blockList';

/**
 * The "pick from open windows" list for the block list (M5.1), modelled
 * on OBS Studio's window picker: every visible top-level window with a
 * title, shown as "process.exe — Window title", one entry per process
 * (blocking is per process). Pure collection logic is separated from
 * the Win32 enumeration so it is unit-testable.
 */
export interface OpenWindowInfo {
  processName: string;
  title: string;
}

export interface RawWindow {
  pid: number;
  title: string;
  /** Full image path of the owning process. */
  path: string;
}

export function collectOpenWindows(raw: RawWindow[], ownPid: number): OpenWindowInfo[] {
  const byProcess = new Map<string, OpenWindowInfo>();
  for (const win of raw) {
    const title = win.title.trim();
    if (!title || title === 'Program Manager') continue; // the desktop itself
    if (win.pid === ownPid) continue; // never list KBMK's own windows
    const processName = processNameFromPath(win.path);
    if (!processName) continue;
    if (!byProcess.has(processName)) byProcess.set(processName, { processName, title });
  }
  return [...byProcess.values()].sort((a, b) => a.processName.localeCompare(b.processName));
}

interface EnumFfi {
  enumProcPtr: unknown;
  enumWindows: (cb: unknown, lParam: number) => boolean;
  isWindowVisible: (hwnd: unknown) => boolean;
  getWindowTextW: (hwnd: unknown, buffer: Buffer, max: number) => number;
  getWindowThreadProcessId: (hwnd: unknown, out: Buffer) => number;
  openProcess: (access: number, inherit: boolean, pid: number) => unknown;
  queryFullProcessImageName: (handle: unknown, flags: number, buffer: Buffer, sizePtr: Buffer) => boolean;
  closeHandle: (handle: unknown) => boolean;
  registerCallback: (fn: (hwnd: unknown) => boolean) => unknown;
  unregisterCallback: (cb: unknown) => void;
}

/**
 * The FFI surface is built ONCE per process. koffi.proto() registers
 * its type name globally — building it per call made the first
 * enumeration succeed and every Refresh after it throw
 * "Duplicate type name 'KbmkEnumWindowsProc'" (M5.4 fix).
 */
let ffiCache: EnumFfi | null = null;

function getFfi(): EnumFfi {
  if (ffiCache) return ffiCache;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const koffi = require('koffi');
  const user32 = koffi.load('user32.dll');
  const kernel32 = koffi.load('kernel32.dll');
  const EnumProc = koffi.proto('bool __stdcall KbmkEnumWindowsProc(void *, int64)');
  const enumProcPtr = koffi.pointer(EnumProc);
  ffiCache = {
    enumProcPtr,
    enumWindows: user32.func('EnumWindows', 'bool', [enumProcPtr, 'int64']),
    isWindowVisible: user32.func('IsWindowVisible', 'bool', ['void *']),
    getWindowTextW: user32.func('GetWindowTextW', 'int', ['void *', 'void *', 'int']),
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
    registerCallback: (fn) => koffi.register(fn, enumProcPtr),
    unregisterCallback: (cb) => koffi.unregister(cb),
  };
  return ffiCache;
}

/** Enumerate open windows on Windows; [] anywhere else or on failure
 *  (failures are logged with their cause — never silent). */
export function listOpenWindows(): OpenWindowInfo[] {
  if (process.platform !== 'win32') return [];
  try {
    const ffi = getFfi();

    const hwnds: unknown[] = [];
    const callback = ffi.registerCallback((hwnd: unknown) => {
      try {
        if (ffi.isWindowVisible(hwnd)) hwnds.push(hwnd);
      } catch {
        // Skip the odd window; enumeration continues.
      }
      return true;
    });
    try {
      ffi.enumWindows(callback, 0);
    } finally {
      ffi.unregisterCallback(callback);
    }

    const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
    const pathCache = new Map<number, string>();
    const pathForPid = (pid: number): string => {
      const cached = pathCache.get(pid);
      if (cached !== undefined) return cached;
      let path = '';
      const handle = ffi.openProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
      if (handle) {
        try {
          const buffer = Buffer.alloc(1024);
          const sizeBuf = Buffer.alloc(4);
          sizeBuf.writeUInt32LE(512, 0);
          if (ffi.queryFullProcessImageName(handle, 0, buffer, sizeBuf)) {
            path = buffer.toString('utf16le', 0, sizeBuf.readUInt32LE(0) * 2);
          }
        } catch {
          path = '';
        } finally {
          ffi.closeHandle(handle);
        }
      }
      pathCache.set(pid, path);
      return path;
    };

    const raw: RawWindow[] = [];
    const titleBuffer = Buffer.alloc(1024);
    for (const hwnd of hwnds) {
      const length = ffi.getWindowTextW(hwnd, titleBuffer, 512);
      if (!length) continue;
      const title = titleBuffer.toString('utf16le', 0, length * 2);
      const pidBuf = Buffer.alloc(4);
      ffi.getWindowThreadProcessId(hwnd, pidBuf);
      const pid = pidBuf.readUInt32LE(0);
      if (!pid) continue;
      raw.push({ pid, title, path: pathForPid(pid) });
    }
    return collectOpenWindows(raw, process.pid);
  } catch (error) {
    console.error(
      '[KBMK] could not enumerate open windows:',
      error instanceof Error ? error.message : error,
    );
    return [];
  }
}
