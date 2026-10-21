import type { KeyHook, KeyEventLike } from './KeyHook';
import { decideWin32Key } from './vkChar';
import { INJECT_MAGIC } from '../shared/injectMagic';

/**
 * Windows-only key capture that sees the actual text being typed (M2 fix
 * for Avro / Bengali input).
 *
 * How it works:
 * - Installs a WH_KEYBOARD_LL hook with koffi (pure FFI, prebuilt — no
 *   node-gyp compilation) and reads KBDLLHOOKSTRUCT directly, which
 *   uiohook-napi never exposes to JavaScript.
 * - vkCode === VK_PACKET means the "key" is finished Unicode text
 *   injected with KEYEVENTF_UNICODE — this is how Avro Keyboard delivers
 *   Bengali — and the character is in scanCode.
 * - Everything else is resolved with ToUnicodeEx against the foreground
 *   window's keyboard layout, so real layouts yield real characters.
 * - The hook never blocks a key: it always calls CallNextHookEx. One
 *   exception (M5.14): while a paste offer is on screen, Esc — the
 *   offer's "keep it" key — is swallowed so the focused app does not
 *   also act on it; the offer is a modal and Esc cancels the modal.
 *
 * All koffi setup is lazy and fully guarded: on any failure this class
 * reports through onError, `available` stays false, and the app falls
 * back to the uiohook capture (Latin layouts) instead of breaking.
 * Windows-only: needs user test on a real Windows machine.
 */

const WH_KEYBOARD_LL = 13;
const WM_KEYDOWN = 0x0100;
const WM_SYSKEYDOWN = 0x0105;
const VK_PACKET = 0xe7;
const VK_CAPITAL = 0x14;

interface KbdStruct {
  vkCode: number;
  scanCode: number;
  flags: number;
  time: number;
  /** koffi decodes uint64 as BigInt (values can exceed 2^53 in theory). */
  dwExtraInfo: number | bigint;
}

export class Win32LayoutKeyHook implements KeyHook {
  /** True only after the native hook was successfully installed. */
  available = false;

  private handler: ((event: KeyEventLike) => void) | null = null;
  private injecting = false;
  private offerPending = false;
  private readonly onError: (error: unknown) => void;
  private readonly debugRaw: ((line: string) => void) | null;
  private teardown: (() => void) | null = null;

  constructor(
    onError: (error: unknown) => void = () => undefined,
    debugRaw: ((line: string) => void) | null = null,
  ) {
    this.onError = onError;
    this.debugRaw = debugRaw;
  }

  start(onEvent: (event: KeyEventLike) => void): void {
    this.handler = onEvent;
    if (process.platform !== 'win32') {
      this.onError(new Error('Win32LayoutKeyHook is Windows-only'));
      return;
    }
    try {
      this.teardown = this.install();
      this.available = this.teardown !== null;
      if (!this.available) {
        this.onError(new Error('SetWindowsHookExW returned no handle'));
      }
    } catch (error) {
      this.available = false;
      this.teardown = null;
      this.onError(error);
    }
  }

  private install(): (() => void) | null {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const koffi = require('koffi');
    const user32 = koffi.load('user32.dll');
    const kernel32 = koffi.load('kernel32.dll');

    const KbdllStruct = koffi.struct('KbmkKbdllHookStruct', {
      vkCode: 'uint32',
      scanCode: 'uint32',
      flags: 'uint32',
      time: 'uint32',
      dwExtraInfo: 'uint64',
    });
    const HookProto = koffi.proto(
      'int64 __stdcall KbmkHookProc(int, uint64, KbmkKbdllHookStruct *)',
    );

    const SetWindowsHookExW = user32.func('SetWindowsHookExW', 'void *', [
      'int',
      koffi.pointer(HookProto),
      'void *',
      'uint32',
    ]);
    const UnhookWindowsHookEx = user32.func('UnhookWindowsHookEx', 'bool', ['void *']);
    const CallNextHookEx = user32.func('CallNextHookEx', 'int64', [
      'void *',
      'int',
      'uint64',
      'void *',
    ]);
    const GetModuleHandleW = kernel32.func('GetModuleHandleW', 'void *', ['void *']);
    const GetForegroundWindow = user32.func('GetForegroundWindow', 'void *', []);
    const GetWindowThreadProcessId = user32.func('GetWindowThreadProcessId', 'uint32', [
      'void *',
      'void *',
    ]);
    const GetKeyboardLayout = user32.func('GetKeyboardLayout', 'void *', ['uint32']);
    const GetAsyncKeyState = user32.func('GetAsyncKeyState', 'int16', ['int']);
    const GetKeyState = user32.func('GetKeyState', 'int16', ['int']);
    const ToUnicodeEx = user32.func('ToUnicodeEx', 'int', [
      'uint32',
      'uint32',
      'void *',
      'void *',
      'int',
      'uint32',
      'void *',
    ]);

    const asyncDown = (vk: number): boolean => (GetAsyncKeyState(vk) & 0x8000) !== 0;
    let capsOn = (GetKeyState(VK_CAPITAL) & 1) !== 0;

    /** Resolve a key to the foreground layout's text. Runs for every
     *  printable keydown so ToUnicodeEx's dead-key state stays in step
     *  with the user's typing (it is a per-thread stream of our own). */
    const resolve = (vk: number, scan: number): string | null => {
      const keyState = Buffer.alloc(256);
      const put = (code: number, down: boolean, toggled = false) => {
        keyState[code] = (down ? 0x80 : 0) | (toggled ? 0x01 : 0);
      };
      put(0x10, asyncDown(0x10));
      put(0xa0, asyncDown(0xa0));
      put(0xa1, asyncDown(0xa1));
      put(0x11, asyncDown(0x11));
      put(0xa2, asyncDown(0xa2));
      put(0xa3, asyncDown(0xa3));
      put(0x12, asyncDown(0x12));
      put(0xa4, asyncDown(0xa4));
      put(0xa5, asyncDown(0xa5));
      put(VK_CAPITAL, false, capsOn);
      put(vk, true);

      const fg = GetForegroundWindow();
      const tid = fg ? GetWindowThreadProcessId(fg, null) : 0;
      const hkl = GetKeyboardLayout(tid || 0);
      const out = Buffer.alloc(32);
      const ret = ToUnicodeEx(vk, scan, keyState, out, 16, 0, hkl);
      if (ret <= 0) return null; // 0: no translation; -1: dead key (state kept for next call)
      return out.toString('utf16le', 0, ret * 2);
    };

    const callback = koffi.register(
      (nCode: number, wParam: number, lParam: unknown) => {
        // The hook must never throw. It blocks exactly one key in one
        // situation: Esc while a paste offer is pending (below).
        let swallow = false;
        try {
          if (nCode >= 0 && (wParam === WM_KEYDOWN || wParam === WM_SYSKEYDOWN)) {
            const info = koffi.decode(lParam, KbdllStruct) as KbdStruct;
            if (info.vkCode === VK_CAPITAL) capsOn = !capsOn;
            // Keys KBMK injected itself carry INJECT_MAGIC in
            // dwExtraInfo (see WindowsTextInjector). They are never the
            // user's typing — skip them before anything else, so a
            // pasted translation can never feed back into the buffer.
            // The magic is the ONLY gate: an earlier version also
            // dropped every event while a swap was injecting, which
            // silently ate real letters typed fast after a replacement
            // (the buffer saw "ou" for "you"). Every synthetic key the
            // injector sends carries the magic, so nothing is lost by
            // trusting it alone.
            const extraInfo =
              typeof info.dwExtraInfo === 'bigint'
                ? Number(info.dwExtraInfo & 0xffffffffn)
                : (info.dwExtraInfo ?? 0) & 0xffffffff;
            if (extraInfo !== INJECT_MAGIC) {
              const isPacket = info.vkCode === VK_PACKET;
              const resolved = isPacket ? null : resolve(info.vkCode, info.scanCode);
              this.debugRaw?.(
                `win32 vk=${info.vkCode} scan=${info.scanCode} flags=${info.flags} ` +
                  `resolved=${resolved === null ? 'null' : JSON.stringify(resolved)}`,
              );
              const events = decideWin32Key({
                vkCode: info.vkCode,
                scanCode: info.scanCode,
                resolved,
                shift: asyncDown(0x10),
                ctrl: asyncDown(0x11),
                alt: asyncDown(0x12),
                meta: asyncDown(0x5b) || asyncDown(0x5c),
              });
              for (const event of events) {
                // Esc dismissing a paste offer is the modal's cancel:
                // consume that one key so the app does not also act
                // on it while the offer is up.
                if (
                  this.offerPending &&
                  event.type === 'hotkey' &&
                  event.hotkey === 'dismiss-paste'
                ) {
                  swallow = true;
                }
                this.handler?.(event);
              }
            }
          }
        } catch {
          // Dropping one key event is acceptable; crashing the hook is not.
        }
        if (swallow) return 1; // non-zero: the key goes no further
        return CallNextHookEx(null, nCode, wParam, lParam);
      },
      koffi.pointer(HookProto),
    );

    const handle = SetWindowsHookExW(WH_KEYBOARD_LL, callback, GetModuleHandleW(null), 0);
    if (!handle) {
      koffi.unregister(callback);
      return null;
    }
    return () => {
      try {
        UnhookWindowsHookEx(handle);
      } catch {
        // Ignore: teardown must not throw during app quit.
      }
      koffi.unregister(callback);
    };
  }

  stop(): void {
    try {
      this.teardown?.();
    } catch {
      // Ignore.
    }
    this.teardown = null;
    this.available = false;
    this.handler = null;
  }

  isInjecting(): boolean {
    return this.injecting;
  }

  setInjecting(value: boolean): void {
    this.injecting = value;
  }

  setOfferPending(value: boolean): void {
    this.offerPending = value;
  }
}
