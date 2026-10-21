import type { ApiLanguageOption, Language } from './types';
import { LANGUAGES } from './languages';

/**
 * Merge the API's supported list with the built-in list (M4.2): the
 * API decides WHICH languages exist and their English names; the
 * built-in entries contribute native labels and search aliases (e.g.
 * "bangla") for the codes they know. Sorted by name for the menu.
 * Pure — unit tested.
 */
export function mergeLanguageLists(
  api: ApiLanguageOption[],
  builtin: Language[] = LANGUAGES,
): Language[] {
  const byCode = new Map(builtin.map((l) => [l.code, l]));
  const merged = api.map((entry) => {
    const known = byCode.get(entry.code);
    return {
      code: entry.code,
      label: entry.name || known?.label || entry.code,
      nativeLabel: known?.nativeLabel ?? entry.name ?? entry.code,
      ...(known?.aliases ? { aliases: known.aliases } : {}),
    } satisfies Language;
  });
  return merged.sort((a, b) => a.label.localeCompare(b.label));
}
