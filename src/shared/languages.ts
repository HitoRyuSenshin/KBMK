import type { Language } from './types';

/**
 * Built-in fallback list (Google Cloud Translation v2 codes). Since
 * M4.2 the pill prefers the API's own supported list (fetched with the
 * active key); this list is what shows before any key exists, in
 * keyless mode, and offline.
 */
export const LANGUAGES: Language[] = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'es', label: 'Spanish', nativeLabel: 'Español' },
  { code: 'bn', label: 'Bengali', nativeLabel: 'বাংলা', aliases: ['bangla'] },
  { code: 'ar', label: 'Arabic', nativeLabel: 'العربية' },
  { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी' },
  { code: 'fr', label: 'French', nativeLabel: 'Français' },
  { code: 'de', label: 'German', nativeLabel: 'Deutsch' },
  { code: 'pt', label: 'Portuguese', nativeLabel: 'Português' },
  { code: 'ru', label: 'Russian', nativeLabel: 'Русский' },
  { code: 'zh-CN', label: 'Chinese (Simplified)', nativeLabel: '简体中文' },
  { code: 'ja', label: 'Japanese', nativeLabel: '日本語' },
  { code: 'ko', label: 'Korean', nativeLabel: '한국어' },
  { code: 'it', label: 'Italian', nativeLabel: 'Italiano' },
  { code: 'tr', label: 'Turkish', nativeLabel: 'Türkçe' },
  { code: 'ur', label: 'Urdu', nativeLabel: 'اردو' },
  { code: 'id', label: 'Indonesian', nativeLabel: 'Bahasa Indonesia' },
  { code: 'nl', label: 'Dutch', nativeLabel: 'Nederlands' },
  { code: 'pl', label: 'Polish', nativeLabel: 'Polski' },
  { code: 'uk', label: 'Ukrainian', nativeLabel: 'Українська' },
  { code: 'vi', label: 'Vietnamese', nativeLabel: 'Tiếng Việt' },
  { code: 'th', label: 'Thai', nativeLabel: 'ไทย' },
  { code: 'fa', label: 'Persian', nativeLabel: 'فارسی' },
  { code: 'sv', label: 'Swedish', nativeLabel: 'Svenska' },
  { code: 'el', label: 'Greek', nativeLabel: 'Ελληνικά' },
  { code: 'fil', label: 'Filipino', nativeLabel: 'Filipino', aliases: ['philippine', 'pinoy'] },
  { code: 'tl', label: 'Tagalog', nativeLabel: 'Tagalog' },
  { code: 'ms', label: 'Malay', nativeLabel: 'Bahasa Melayu' },
  { code: 'zh-TW', label: 'Chinese (Traditional)', nativeLabel: '繁體中文' },
  { code: 'ta', label: 'Tamil', nativeLabel: 'தமிழ்' },
  { code: 'te', label: 'Telugu', nativeLabel: 'తెలుగు' },
  { code: 'ml', label: 'Malayalam', nativeLabel: 'മലയാളം' },
  { code: 'mr', label: 'Marathi', nativeLabel: 'मराठी' },
  { code: 'gu', label: 'Gujarati', nativeLabel: 'ગુજરાતી' },
  { code: 'pa', label: 'Punjabi', nativeLabel: 'ਪੰਜਾਬੀ' },
  { code: 'kn', label: 'Kannada', nativeLabel: 'ಕನ್ನಡ' },
  { code: 'my', label: 'Burmese', nativeLabel: 'မြန်မာ' },
  { code: 'km', label: 'Khmer', nativeLabel: 'ខ្មែរ' },
  { code: 'lo', label: 'Lao', nativeLabel: 'ລາວ' },
  { code: 'ne', label: 'Nepali', nativeLabel: 'नेपाली' },
  { code: 'si', label: 'Sinhala', nativeLabel: 'සිංහල' },
  { code: 'am', label: 'Amharic', nativeLabel: 'አማርኛ' },
  { code: 'sw', label: 'Swahili', nativeLabel: 'Kiswahili' },
];

export function findLanguage(code: string, list: Language[] = LANGUAGES): Language | undefined {
  return list.find((l) => l.code === code);
}

/** Short chip label, e.g. source "auto" detected as English -> "EN auto". */
export function sourceChipLabel(source: string, detected = 'en', list: Language[] = LANGUAGES): string {
  if (source === 'auto') return `${detected.toUpperCase()} auto`;
  const lang = findLanguage(source, list);
  return lang ? lang.code.toUpperCase() : source.toUpperCase();
}

export function targetChipLabel(target: string, list: Language[] = LANGUAGES): string {
  const lang = findLanguage(target, list);
  return lang ? `${lang.code.toUpperCase()} · ${lang.label}` : target.toUpperCase();
}

/** Case-insensitive search over label, native label, code and aliases. */
export function searchLanguages(query: string, list: Language[] = LANGUAGES): Language[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...list];
  return list.filter(
    (l) =>
      l.label.toLowerCase().includes(q) ||
      l.nativeLabel.toLowerCase().includes(q) ||
      l.code.toLowerCase().includes(q) ||
      // e.g. "bang" / "bangla" find Bengali through its alias "bangla".
      (l.aliases ?? []).some((a) => a.toLowerCase().includes(q)),
  );
}

/**
 * Swap source/target. "auto" cannot become a target, so swapping from auto
 * pins the source to the old target and sets the target to English (the
 * M1 mock detected language). Pure function — unit tested.
 */
export function swappedLanguages(
  source: string,
  target: string,
  detected = 'en',
): { source: string; target: string } {
  if (source === 'auto') return { source: target, target: detected };
  return { source: target, target: source };
}
