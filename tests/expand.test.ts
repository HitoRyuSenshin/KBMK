import { describe, expect, it } from 'vitest';
import {
  expandDirectionFor,
  pillAnchorY,
  rightAnchoredX,
  windowYFor,
} from '../src/shared/expand';

const PILL = 56;
const MENU = 344;

describe('pill expansion geometry (M5.11)', () => {
  it('anchors the pill from window bounds: bottom edge when open above, top edge otherwise', () => {
    // Collapsed window: the pill IS the window.
    expect(pillAnchorY({ y: 900, height: PILL }, false, 'above', PILL)).toBe(900);
    // Menu open above: window grew upward, pill sits at its bottom.
    expect(pillAnchorY({ y: 612, height: MENU }, true, 'above', PILL)).toBe(900);
    // Menu open below: window grew downward, pill sits at its top.
    expect(pillAnchorY({ y: 40, height: MENU }, true, 'below', PILL)).toBe(40);
  });

  it('opens upward normally, downward only when the top is cramped and below has room', () => {
    const grow = MENU - PILL;
    expect(expandDirectionFor(800, 100, grow)).toBe('above'); // plenty above
    expect(expandDirectionFor(40, 900, grow)).toBe('below'); // pill near the top
    expect(expandDirectionFor(40, 100, grow)).toBe('above'); // cramped both ways: keep above
    expect(expandDirectionFor(grow, 0, grow)).toBe('above'); // exactly enough above
  });

  it('computes the window top for each direction', () => {
    expect(windowYFor(900, 'above', MENU, PILL)).toBe(612); // grows up from the pill
    expect(windowYFor(40, 'below', MENU, PILL)).toBe(40); // grows down from the pill
    expect(windowYFor(900, 'above', PILL, PILL)).toBe(900); // collapsed: the pill rect itself
    expect(windowYFor(40, 'below', PILL, PILL)).toBe(40);
  });

  it('round-trips: expanding then collapsing returns the pill to its dragged spot', () => {
    // Pill dragged to the top-left area, menu opens below, then closes.
    const anchorY = pillAnchorY({ y: 30, height: PILL }, false, 'above', PILL);
    const dir = expandDirectionFor(30, 1000, MENU - PILL);
    expect(dir).toBe('below');
    const openY = windowYFor(anchorY, dir, MENU, PILL);
    const backY = pillAnchorY({ y: openY, height: MENU }, true, dir, PILL);
    expect(backY).toBe(30);
    expect(windowYFor(backY, dir, PILL, PILL)).toBe(30);
  });

  it('right-anchored width changes keep the right edge put and stay on screen (M5.13)', () => {
    const area = { x: 0, width: 1920 };
    // Shrinking 384 -> 320 at the right edge: left edge moves in by 64.
    expect(rightAnchoredX(1904, 320, area)).toBe(1584);
    // Growing back: same right edge.
    expect(rightAnchoredX(1904, 384, area)).toBe(1520);
    // A pill parked at the left edge never slides off-screen.
    expect(rightAnchoredX(320, 384, area)).toBe(0);
  });
});
