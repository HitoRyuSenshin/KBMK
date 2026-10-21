import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Regression test for the grey-rectangle bug: the pill window must stay
 * 100% transparent outside the rounded pill. Setting backgroundMaterial
 * (Acrylic/Mica) on Windows paints the whole rectangular window grey.
 */
const mainSource = readFileSync(join(__dirname, '../src/main/main.ts'), 'utf8');
const rendererCss = readFileSync(
  join(__dirname, '../src/renderer/styles.css'),
  'utf8',
);

describe('pill window transparency', () => {
  it('does not set backgroundMaterial on the pill window', () => {
    expect(mainSource).not.toMatch(/backgroundMaterial\s*:/);
  });

  it('sets a fully transparent window background colour', () => {
    expect(mainSource).toContain("backgroundColor: '#00000000'");
    expect(mainSource).toContain('transparent: true');
  });

  it('renderer page background is transparent (glass lives on the pill)', () => {
    expect(rendererCss).toMatch(/html,\s*body\s*\{[^}]*background:\s*transparent/);
  });
});

describe('frameless windows (M5.1)', () => {
  const settingsSource = readFileSync(
    join(__dirname, '../src/main/settingsWindow.ts'),
    'utf8',
  );

  it('the pill window has no native frame', () => {
    expect(mainSource).toContain('frame: false');
  });

  it('the Settings window is frameless and transparent too — no native title bar anywhere', () => {
    expect(settingsSource).toContain('frame: false');
    expect(settingsSource).toContain('transparent: true');
    expect(settingsSource).toContain("backgroundColor: '#00000000'");
  });

  it('drag regions exist: the pill glass and the Settings title bar', () => {
    expect(rendererCss).toContain('-webkit-app-region: drag');
    expect(rendererCss).toContain('-webkit-app-region: no-drag');
  });

  it("the Windows DWM shadow is disabled (Electron's hasShadow is a no-op on Windows)", () => {
    expect(mainSource).toContain('DwmSetWindowAttribute');
    expect(mainSource).toContain('DWMWA_NCRENDERING_POLICY');
  });

  it('real Windows blur-behind is applied to the pill window (M5.12: CSS backdrop-filter cannot blur other apps)', () => {
    expect(mainSource).toContain('SetWindowCompositionAttribute');
    expect(mainSource).toContain('ACCENT_ENABLE_BLURBEHIND');
    expect(mainSource).toContain('applyWindowsGlassBlur(win)');
    // …with a rounded window region so the blur hugs the pill's shape.
    expect(mainSource).toContain('SetWindowRgn');
    expect(mainSource).toContain('CreateRoundRectRgn');
  });
});
