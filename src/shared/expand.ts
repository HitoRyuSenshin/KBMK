/**
 * Pill window expansion geometry (M5.11) — pure functions.
 * The pill can be dragged anywhere; when its menu/toast opens, the
 * window grows FROM the pill's current position (never snapping back
 * to a default corner), upward normally, or downward when the pill
 * sits near the top of the screen and there is room below instead.
 */

export type ExpandDirection = 'above' | 'below';

/**
 * The pill's own top edge (screen Y), derived from the window bounds:
 * with content open above, the pill is at the window's bottom edge;
 * with content open below (or collapsed), at its top edge.
 */
export function pillAnchorY(
  bounds: { y: number; height: number },
  expanded: boolean,
  direction: ExpandDirection,
  pillHeight: number,
): number {
  return expanded && direction === 'above'
    ? bounds.y + bounds.height - pillHeight
    : bounds.y;
}

/** Grow upward unless there isn't room above and there is room below. */
export function expandDirectionFor(
  spaceAbove: number,
  spaceBelow: number,
  growBy: number,
): ExpandDirection {
  return spaceAbove < growBy && spaceBelow >= growBy ? 'below' : 'above';
}

/** The window's top edge for a given pill anchor, direction and height. */
export function windowYFor(
  anchorY: number,
  direction: ExpandDirection,
  windowHeight: number,
  pillHeight: number,
): number {
  return direction === 'above' ? anchorY + pillHeight - windowHeight : anchorY;
}

/**
 * The window's left edge when its width changes but its RIGHT edge
 * must stay put (M5.13, content-hugging width), clamped so the window
 * never slides off the work area.
 */
export function rightAnchoredX(
  rightEdge: number,
  width: number,
  area: { x: number; width: number },
): number {
  const x = rightEdge - width;
  return Math.max(area.x, Math.min(x, area.x + area.width - width));
}
