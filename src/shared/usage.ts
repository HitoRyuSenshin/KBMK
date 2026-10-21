/**
 * Pill usage readout formatting (M5.10) — pure functions.
 * Google/Azure expose no per-key usage endpoint KBMK can call, so for
 * those keys the readout is the local monthly translation count. DeepL
 * does expose real character usage; when it is available the readout
 * shows characters used / the key's character limit.
 */

/** 999 -> "999", 1234 -> "1.2k", 500000 -> "500k", 2000000 -> "2M". */
export function formatCharCount(n: number): string {
  const trim = (s: string): string => s.replace(/\.0$/, '');
  if (!Number.isFinite(n) || n < 0) return '0';
  if (n < 1000) return String(Math.floor(n));
  if (n < 1_000_000) return `${trim((n / 1000).toFixed(1))}k`;
  return `${trim((n / 1_000_000).toFixed(1))}M`;
}

export function usageTextFor(input: {
  /** Local per-profile counter: translations served this month. */
  monthlyCount: number;
  /** Real API usage, when the provider reports it (DeepL). */
  deepl?: { count: number; limit: number } | null;
}): string {
  if (input.deepl && input.deepl.limit > 0) {
    return `${formatCharCount(input.deepl.count)}/${formatCharCount(input.deepl.limit)} chars`;
  }
  return `${input.monthlyCount} used`;
}
