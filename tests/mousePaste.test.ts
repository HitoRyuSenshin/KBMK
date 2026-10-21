import { describe, expect, it } from 'vitest';
import { createMousePasteTracker } from '../src/hook/mousePaste';
import { WordBuffer } from '../src/hook/WordBuffer';

describe('createMousePasteTracker (M5.16)', () => {
  it('a nearby left click soon after a right click is a menu pick', () => {
    const t = createMousePasteTracker();
    t.rightDown(500, 400, 1000);
    expect(t.leftDown(560, 470, 1800)).toBe(true); // menu item below-right
  });

  it('the pick is one-shot: a second left click is not another pick', () => {
    const t = createMousePasteTracker();
    t.rightDown(500, 400, 1000);
    expect(t.leftDown(560, 470, 1500)).toBe(true);
    expect(t.leftDown(560, 470, 1600)).toBe(false);
  });

  it('too slow, too far, or no right click at all: not a menu pick', () => {
    const slow = createMousePasteTracker();
    slow.rightDown(500, 400, 1000);
    expect(slow.leftDown(560, 470, 1000 + 2501)).toBe(false);

    const far = createMousePasteTracker();
    far.rightDown(100, 100, 0);
    expect(far.leftDown(900, 100, 500)).toBe(false);

    const none = createMousePasteTracker();
    expect(none.leftDown(100, 100, 0)).toBe(false);
  });

  it('a fresh right click re-arms the tracker', () => {
    const t = createMousePasteTracker();
    t.rightDown(500, 400, 1000);
    expect(t.leftDown(560, 470, 9000)).toBe(false); // stale
    t.rightDown(300, 300, 9500);
    expect(t.leftDown(320, 350, 9900)).toBe(true);
  });
});

describe('WordBuffer with mouse events (M5.16)', () => {
  it('a mouse press abandons the word being typed, like the old reset', () => {
    const buffer = new WordBuffer();
    buffer.handle({ type: 'char', char: 'h' });
    buffer.handle({ type: 'char', char: 'i' });
    expect(buffer.current).toBe('hi');
    expect(buffer.handle({ type: 'mouse', mouse: { button: 1, x: 10, y: 10 } })).toBeNull();
    expect(buffer.current).toBe('');
  });
});
