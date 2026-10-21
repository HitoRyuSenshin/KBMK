/**
 * How many Backspaces delete `text` in a Windows editor: one per
 * UTF-16 code unit — i.e. the string's `.length`.
 *
 * M4.0 counted grapheme clusters (আমি = 2) on the assumption that
 * Windows editors delete a whole Indic cluster per Backspace. The
 * user's Windows 11 Notepad test proved the opposite: শিহাব (5 code
 * units, 3 graphemes) with 3+1 backspaces left exactly "শি" behind,
 * and নাম (3 code units, 2 graphemes) with 2+1 left exactly "ন" —
 * arithmetic that only works if each Backspace removes exactly one
 * code unit, combining vowel signs included.
 */
export function countDeletionUnits(text: string): number {
  return text.length;
}
