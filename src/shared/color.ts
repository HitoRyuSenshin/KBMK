/**
 * Accent colour plumbing (M5.2) — pure functions. The glass tint is
 * driven by one accent hex; the default is KBMK red.
 */
export const DEFAULT_ACCENT = '#e24b4a';

/** "#E24B4A" / "e24b4a" / "#abc" -> "#e24b4a" / "#aabbcc"; else null. */
export function normalizeHexColor(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const match = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(input.trim());
  if (!match) return null;
  let hex = match[1].toLowerCase();
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  return `#${hex}`;
}

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/** h in degrees [0,360), s/v in [0,1] -> [r, g, b] each 0..255. */
export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const hue = ((h % 360) + 360) % 360;
  const sat = clamp01(s);
  const val = clamp01(v);
  const c = val * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = val - c;
  const [r, g, b] =
    hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x]
    : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

/** h in degrees [0,360), s/v in [0,1] -> "#rrggbb". */
export function hsvToHex(h: number, s: number, v: number): string {
  const channel = (n: number) => n.toString(16).padStart(2, '0');
  const [r, g, b] = hsvToRgb(h, s, v);
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

export interface Hsv {
  h: number;
  s: number;
  v: number;
}

/**
 * Glass opacity (M5.10): how solid the pill/panels are, 1 = the
 * original M5 look. The floor keeps text readable over any wallpaper.
 */
export function clampGlassOpacity(input: unknown): number {
  if (typeof input !== 'number' || !Number.isFinite(input)) return 1;
  return Math.round(Math.min(1, Math.max(0.35, input)) * 100) / 100;
}

/** The pill's "active" dot colours (M5.10). */
export const INDICATOR_GREEN = '#2ecc71';
export const INDICATOR_BLUE = '#0a84ff';

/**
 * The active dot is green — unless the glass accent itself is green or
 * near-green (hue ~65°–175°), where a green dot blends into the tinted
 * glass and disappears; then the dot turns blue instead (user request).
 */
export function activeIndicatorColor(accentHex: string): string {
  const { h, s } = hexToHsv(normalizeHexColor(accentHex) ?? DEFAULT_ACCENT);
  return s >= 0.2 && h >= 65 && h <= 175 ? INDICATOR_BLUE : INDICATOR_GREEN;
}

export function hexToHsv(hex: string): Hsv {
  const normalized = normalizeHexColor(hex) ?? DEFAULT_ACCENT;
  const r = parseInt(normalized.slice(1, 3), 16) / 255;
  const g = parseInt(normalized.slice(3, 5), 16) / 255;
  const b = parseInt(normalized.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta > 0) {
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
  }
  return {
    h: ((h % 360) + 360) % 360,
    s: max === 0 ? 0 : delta / max,
    v: max,
  };
}
