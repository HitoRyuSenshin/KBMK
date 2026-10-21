import { describe, expect, it } from 'vitest';
import { collectOpenWindows, type RawWindow } from '../src/main/openWindows';

const raw = (partial: Partial<RawWindow>): RawWindow => ({
  pid: 100,
  title: 'Untitled - Notepad',
  path: 'C:\\Windows\\System32\\notepad.exe',
  ...partial,
});

describe('collectOpenWindows (OBS-style picker data)', () => {
  it('keeps one entry per process, sorted, with the first title seen', () => {
    const list = collectOpenWindows(
      [
        raw({ pid: 2, title: 'Doc2', path: 'C:\\Apps\\zeta.exe' }),
        raw({ pid: 1, title: 'Doc1', path: 'C:\\Apps\\alpha.exe' }),
        raw({ pid: 1, title: 'Doc1 - second window', path: 'C:\\Apps\\alpha.exe' }),
      ],
      999,
    );
    expect(list).toEqual([
      { processName: 'alpha.exe', title: 'Doc1' },
      { processName: 'zeta.exe', title: 'Doc2' },
    ]);
  });

  it('filters untitled windows, the desktop, and our own windows', () => {
    const list = collectOpenWindows(
      [
        raw({ title: '   ' }),
        raw({ title: 'Program Manager', path: 'C:\\Windows\\explorer.exe' }),
        raw({ pid: 999, title: 'KBMK — Settings', path: 'C:\\Apps\\electron.exe' }),
        raw({ title: 'Real app', path: 'C:\\Apps\\real.exe' }),
      ],
      999,
    );
    expect(list).toEqual([{ processName: 'real.exe', title: 'Real app' }]);
  });

  it('skips windows whose process path cannot be resolved', () => {
    expect(collectOpenWindows([raw({ path: '' })], 1)).toEqual([]);
  });
});
