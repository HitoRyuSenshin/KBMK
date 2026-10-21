import { describe, expect, it } from 'vitest';
import { formatCharCount, usageTextFor } from '../src/shared/usage';

describe('formatCharCount', () => {
  it('formats counts compactly for the pill', () => {
    expect(formatCharCount(0)).toBe('0');
    expect(formatCharCount(999)).toBe('999');
    expect(formatCharCount(1234)).toBe('1.2k');
    expect(formatCharCount(1000)).toBe('1k');
    expect(formatCharCount(500_000)).toBe('500k');
    expect(formatCharCount(2_000_000)).toBe('2M');
    expect(formatCharCount(-5)).toBe('0');
  });
});

describe('usageTextFor', () => {
  it('shows real character usage when the provider reports it (DeepL)', () => {
    expect(usageTextFor({ monthlyCount: 9, deepl: { count: 1234, limit: 500_000 } })).toBe(
      '1.2k/500k chars',
    );
  });

  it('falls back to the local monthly count otherwise (Google/Azure)', () => {
    expect(usageTextFor({ monthlyCount: 107 })).toBe('107 used');
    expect(usageTextFor({ monthlyCount: 3, deepl: null })).toBe('3 used');
    expect(usageTextFor({ monthlyCount: 3, deepl: { count: 5, limit: 0 } })).toBe('3 used');
  });
});
