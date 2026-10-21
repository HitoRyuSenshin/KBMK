import { AuthError, NetworkError, QuotaError, TranslationError } from './errors';
import type { TranslationProvider } from './TranslationProvider';
import type { FetchFn } from './GoogleCloudProvider';

const defaultFetch: FetchFn = (url, init) =>
  fetch(url, init) as ReturnType<FetchFn>;

/**
 * Canonical (Google-style) codes -> DeepL codes, and back. DeepL uses
 * upper-case codes and a few special spellings; anything not listed
 * passes through upper-cased, and DeepL itself rejects codes it does
 * not support (mapped to a clear bad-request error below).
 */
const TO_DEEPL: Record<string, string> = {
  'zh-CN': 'ZH-HANS',
  'zh-TW': 'ZH-HANT',
  no: 'NB',
};
const FROM_DEEPL: Record<string, string> = {
  'ZH-HANS': 'zh-CN',
  'ZH-HANT': 'zh-TW',
  ZH: 'zh-CN',
  NB: 'no',
  'EN-GB': 'en',
  'EN-US': 'en',
  'PT-PT': 'pt',
  'PT-BR': 'pt-BR',
};

export function deeplLangCode(code: string): string {
  return TO_DEEPL[code] ?? code.toUpperCase();
}
export function canonicalFromDeepl(deeplCode: string): string {
  return FROM_DEEPL[deeplCode] ?? deeplCode.toLowerCase();
}

/** DeepL free-API keys end in ":fx" and use the free host. */
export function deeplHostForKey(apiKey: string): string {
  return apiKey.trim().endsWith(':fx')
    ? 'https://api-free.deepl.com'
    : 'https://api.deepl.com';
}

interface DeepLErrorBody {
  message?: string;
}

/** Map a DeepL failure to a typed error — never echoing the key. */
export function deeplHttpError(status: number, body: unknown): TranslationError {
  const detail = (body as DeepLErrorBody)?.message;
  if (status === 456) {
    return new QuotaError('DeepL quota exceeded for this key (HTTP 456) — its character limit is used up.');
  }
  if (status === 429) {
    return new QuotaError('DeepL rate limit reached (HTTP 429) — too many requests right now.');
  }
  if (status === 403) {
    return new AuthError('DeepL rejected the key (HTTP 403). Check the key in Settings.');
  }
  if (status === 400) {
    return new TranslationError(
      'bad-request',
      `DeepL bad request (HTTP 400)${detail ? `: ${detail}` : ''} — the language may not be supported by DeepL.`,
    );
  }
  return new TranslationError('unknown', `DeepL error (HTTP ${status})`);
}

/**
 * DeepL API (M5.8, third provider type).
 * POST {host}/v2/translate with header "Authorization: DeepL-Auth-Key
 * <key>" and JSON body {text:[...], target_lang, source_lang?}; the
 * translation is translations[0].text. Free keys (suffix ":fx") are
 * served by api-free.deepl.com, paid keys by api.deepl.com — picked
 * automatically from the key itself.
 *
 * Coverage note: DeepL supports ~35 languages and NOT Bengali — words
 * in unsupported languages surface DeepL's clear 400 error rather than
 * failing silently.
 */
export class DeepLTranslatorProvider implements TranslationProvider {
  readonly id = 'deepl';
  private readonly apiKey: string;
  private readonly fetchFn: FetchFn;
  private readonly host: string;

  constructor(apiKey: string, fetchFn: FetchFn = defaultFetch, host?: string) {
    this.apiKey = apiKey;
    this.fetchFn = fetchFn;
    this.host = host ?? deeplHostForKey(apiKey);
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `DeepL-Auth-Key ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  async translate(text: string, from: string, to: string): Promise<string> {
    const payload: Record<string, unknown> = {
      text: [text],
      target_lang: deeplLangCode(to),
    };
    if (from && from !== 'auto') payload.source_lang = deeplLangCode(from);
    let res: Awaited<ReturnType<FetchFn>>;
    try {
      res = await this.fetchFn(`${this.host}/v2/translate`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(payload),
      });
    } catch {
      throw new NetworkError();
    }
    const body = (await res.json().catch(() => null)) as {
      translations?: Array<{ text?: string }>;
    } | null;
    if (!res.ok) throw deeplHttpError(res.status, body);
    const translated = body?.translations?.[0]?.text;
    if (typeof translated !== 'string') {
      throw new TranslationError('unknown', 'DeepL returned an unexpected response');
    }
    return translated;
  }

  /** Settings "Test connection": one tiny billed translation proves the key. */
  async testConnection(): Promise<void> {
    await this.translate('Hi', 'en', 'es');
  }

  /** DeepL's real usage for this key: characters used / the key's limit. */
  async getUsageChars(): Promise<{ count: number; limit: number }> {
    let res: Awaited<ReturnType<FetchFn>>;
    try {
      res = await this.fetchFn(`${this.host}/v2/usage`, {
        method: 'GET',
        headers: this.headers(),
      });
    } catch {
      throw new NetworkError();
    }
    const body = (await res.json().catch(() => null)) as {
      character_count?: number;
      character_limit?: number;
    } | null;
    if (!res.ok) throw deeplHttpError(res.status, body);
    return {
      count: typeof body?.character_count === 'number' ? body.character_count : 0,
      limit: typeof body?.character_limit === 'number' ? body.character_limit : 0,
    };
  }

  /** DeepL's target-language list (needs the key), mapped to canonical codes. */
  async listLanguages(): Promise<Array<{ code: string; name: string }>> {
    let res: Awaited<ReturnType<FetchFn>>;
    try {
      res = await this.fetchFn(`${this.host}/v2/languages?type=target`, {
        method: 'GET',
        headers: this.headers(),
      });
    } catch {
      throw new NetworkError();
    }
    const body = (await res.json().catch(() => null)) as Array<{
      language?: string;
      name?: string;
    }> | null;
    if (!res.ok) throw deeplHttpError(res.status, body);
    if (!Array.isArray(body)) return [];
    return body
      .filter((entry) => typeof entry.language === 'string')
      .map((entry) => ({
        code: canonicalFromDeepl(entry.language as string),
        name: entry.name ?? (entry.language as string),
      }));
  }
}
