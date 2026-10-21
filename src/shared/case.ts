/**
 * Preserve the typed word's capitalisation on its translation (spec):
 * if the word starts with a capital, capitalise the translation.
 */
export function applySourceCase(sourceWord: string, translated: string): string {
  const first = [...sourceWord][0];
  if (!first) return translated;
  const isCapital = first.toUpperCase() === first && first.toLowerCase() !== first;
  if (!isCapital) return translated;
  const chars = [...translated];
  if (chars.length === 0) return translated;
  chars[0] = chars[0].toUpperCase();
  return chars.join('');
}
