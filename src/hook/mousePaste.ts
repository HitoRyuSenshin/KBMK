/**
 * Mouse-paste detection (M5.16) — pure.
 *
 * A right-click → Paste never reaches the keyboard hook, but the
 * mouse tells the story: a right-button press opens a context menu,
 * and a left-button press shortly after, near the same spot, picks
 * an item from it. Whether the pick was "Paste" is decided in main
 * by comparing the clipboard before and after (Copy/Cut change it;
 * Paste does not). This tracker only answers the geometry/time
 * question: "was that left click plausibly a context-menu pick?"
 */

const MENU_WINDOW_MS = 2500;
/** Context menus open adjacent to the right-click point. */
const MENU_MAX_DX = 420;
const MENU_MAX_DY = 520;

export interface MousePasteTracker {
  /** Record a right-button press (a context menu just opened). */
  rightDown(x: number, y: number, nowMs: number): void;
  /**
   * A left-button press: true when it plausibly selected an item
   * from the menu the recorded right press opened. One-shot — the
   * recorded press is consumed either way.
   */
  leftDown(x: number, y: number, nowMs: number): boolean;
}

export function createMousePasteTracker(): MousePasteTracker {
  let pending: { x: number; y: number; at: number } | null = null;
  return {
    rightDown(x, y, nowMs) {
      pending = { x, y, at: nowMs };
    },
    leftDown(x, y, nowMs) {
      const was = pending;
      pending = null;
      if (!was) return false;
      if (nowMs - was.at > MENU_WINDOW_MS) return false;
      if (Math.abs(x - was.x) > MENU_MAX_DX) return false;
      if (Math.abs(y - was.y) > MENU_MAX_DY) return false;
      return true;
    },
  };
}
