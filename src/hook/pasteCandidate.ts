/**
 * Paste-translation candidates (M5.14; multi-word since M5.17) — pure.
 * Pasted text never passes through the word buffer, so a paste is
 * offered for translation when it is unambiguous prose: one line of
 * text (a word, a phrase, a short sentence), with at least one
 * letter, and no link/email/path/code-looking token in it.
 *
 * The cap is deliberate: replacement deletes character-by-character,
 * so very long pastes would swap slowly and riskily. 300 characters
 * is a few sentences — past that, KBMK stays out of the way.
 */

export interface PasteCandidate {
  /** The exact clipboard text — what actually landed in the document,
   *  so exactly what an accepted swap must delete. */
  raw: string;
  /** The text to translate (the raw text, trimmed). */
  word: string;
  /** One trailing punctuation mark split off a SINGLE-word paste so
   *  it can ride along with the translation; '' for phrases, where
   *  the provider's own punctuation is kept as returned. */
  suffix: string;
}

const TRAILING_PUNCT = new Set([',', '.', '!', '?', ';', ':', '।', '॥']);
export const MAX_PASTE_LENGTH = 300;

export function extractPasteCandidate(clipboardText: string): PasteCandidate | null {
  if (!clipboardText || clipboardText.length > MAX_PASTE_LENGTH) return null;
  if (/[\n\r\t]/.test(clipboardText)) return null; // one line only

  const text = clipboardText.trim();
  if (!text || !/\p{L}/u.test(text)) return null; // must contain a letter

  // Link / email / path / code-looking tokens are never prose offers.
  for (const token of text.split(' ')) {
    if (!token) continue;
    if (token.includes('@') || token.includes('://')) return null;
    if (token.includes('/') || token.includes('\\')) return null;
    if (token.toLowerCase().startsWith('www.')) return null;
  }

  // Single word: split one trailing punctuation mark, as before.
  if (!text.includes(' ')) {
    const last = text[text.length - 1];
    if (TRAILING_PUNCT.has(last) && text.length > 1) {
      const word = text.slice(0, -1);
      if (word && /\p{L}/u.test(word)) return { raw: clipboardText, word, suffix: last };
    }
    return { raw: clipboardText, word: text, suffix: '' };
  }

  return { raw: clipboardText, word: text, suffix: '' };
}
