import { describe, expect, it } from 'vitest';
import {
  LANGUAGES,
  findLanguage,
  searchLanguages,
  sourceChipLabel,
  swappedLanguages,
  targetChipLabel,
} from '../src/shared/languages';

describe('languages', () => {
  it('has unique codes and includes Bangla, Arabic and Spanish', () => {
    const codes = LANGUAGES.map((l) => l.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(findLanguage('bn')?.label).toBe('Bengali');
    expect(findLanguage('ar')?.label).toBe('Arabic');
    expect(findLanguage('es')?.label).toBe('Spanish');
  });

  it('renders the spec source chip for auto', () => {
    expect(sourceChipLabel('auto')).toBe('EN auto');
    expect(sourceChipLabel('fr')).toBe('FR');
  });

  it('renders the target chip with code and label', () => {
    expect(targetChipLabel('es')).toBe('ES · Spanish');
  });

  it('searches by label, native label and code, case-insensitively', () => {
    expect(searchLanguages('span').map((l) => l.code)).toContain('es');
    expect(searchLanguages('বাংলা').map((l) => l.code)).toEqual(['bn']);
    expect(searchLanguages('bang').map((l) => l.code)).toEqual(['bn']);
    expect(searchLanguages('Bangla').map((l) => l.code)).toEqual(['bn']);
    expect(searchLanguages('AR').map((l) => l.code)).toContain('ar');
    expect(searchLanguages('').length).toBe(LANGUAGES.length);
    expect(searchLanguages('zzz-no-match')).toEqual([]);
  });

  it('swap with a manual source exchanges the pair', () => {
    expect(swappedLanguages('en', 'es')).toEqual({ source: 'es', target: 'en' });
  });

  it('swap from auto pins source to old target and target to detected', () => {
    expect(swappedLanguages('auto', 'es')).toEqual({ source: 'es', target: 'en' });
    expect(swappedLanguages('auto', 'bn', 'fr')).toEqual({ source: 'bn', target: 'fr' });
  });
});
