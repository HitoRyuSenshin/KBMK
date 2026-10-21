/**
 * Interface only in M1. The real uiohook-napi implementation lands in M2
 * behind this same interface, so the word buffer and tests never depend
 * on a native module.
 */
export interface KeyEventLike {
  type: 'char' | 'backspace' | 'delimiter' | 'reset' | 'modifier' | 'hotkey' | 'paste' | 'mouse';
  /** Present for type === 'char' | 'delimiter'. */
  char?: string;
  /** Present for type === 'hotkey': 'undo' | 'toggle' | 'dismiss-paste'. */
  hotkey?: string;
  /** Present for type === 'mouse': button press (uiohook: 1 = left, 2 = right). */
  mouse?: { button: number; x: number; y: number };
}

export interface KeyHook {
  start(onEvent: (event: KeyEventLike) => void): void;
  stop(): void;
  /** True while the app itself is injecting text, so its own output is ignored. */
  isInjecting(): boolean;
  setInjecting(value: boolean): void;
  /**
   * Optional (M5.14): while a paste-translation offer is on screen,
   * Esc means "keep the pasted word" — a hook that can consume keys
   * (the Win32 LL hook) swallows that one keypress so the focused
   * app does not also act on it (modal semantics). Hooks that cannot
   * consume (uiohook) just record the flag.
   */
  setOfferPending?(value: boolean): void;
}

/** In-memory fake for unit tests and non-Windows development. */
export class FakeKeyHook implements KeyHook {
  private handler: ((event: KeyEventLike) => void) | null = null;
  private injecting = false;
  private offerPending = false;

  start(onEvent: (event: KeyEventLike) => void): void {
    this.handler = onEvent;
  }
  stop(): void {
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
  get isOfferPending(): boolean {
    return this.offerPending;
  }
  emit(event: KeyEventLike): void {
    if (this.injecting) return;
    this.handler?.(event);
  }
}
