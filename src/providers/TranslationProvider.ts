import type { ApiLanguageOption } from '../shared/types';

export interface TranslationProvider {
  readonly id: string;
  translate(text: string, from: string, to: string): Promise<string>;
  /** Optional: the provider's supported languages (drives the language menus). */
  listLanguages?(): Promise<ApiLanguageOption[]>;
  /** Optional: real usage vs limit, where the API exposes it (DeepL, M5.10). */
  getUsageChars?(): Promise<{ count: number; limit: number }>;
}

/**
 * Mock provider (M1/M3 tests and offline development). Returns a
 * visibly-mocked string so no one mistakes it for a real translation.
 */
export class MockProvider implements TranslationProvider {
  readonly id = 'mock';
  async translate(text: string, _from: string, to: string): Promise<string> {
    return `[${to}] ${text}`;
  }
}
