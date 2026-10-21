import { AuthError, NetworkError, QuotaError, TranslationError } from './errors';
import type { TranslationProvider } from './TranslationProvider';

export type FetchFn = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

const defaultFetch: FetchFn = (url, init) =>
  fetch(url, init) as ReturnType<FetchFn>;

/** Google v2 sometimes returns HTML entities even with format:"text". */
export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_m, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, code: string) =>
      String.fromCodePoint(parseInt(code, 16)),
    )
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

interface GoogleErrorBody {
  error?: { errors?: Array<{ reason?: string }>; message?: string };
}

const QUOTA_REASONS = new Set([
  'dailyLimitExceeded',
  'quotaExceeded',
  'userRateLimitExceeded',
  'rateLimitExceeded',
]);
const AUTH_REASONS = new Set(['keyInvalid', 'invalid', 'authError']);

/** Map an HTTP failure to a typed error — without ever echoing the key or URL. */
export function googleHttpError(status: number, body: unknown): TranslationError {
  const reason = (body as GoogleErrorBody)?.error?.errors?.[0]?.reason ?? '';
  if (status === 429 || QUOTA_REASONS.has(reason)) {
    return new QuotaError(`Google Translate quota reached (HTTP ${status}${reason ? `, ${reason}` : ''})`);
  }
  if (status === 401 || AUTH_REASONS.has(reason) || (status === 403 && !reason)) {
    return new AuthError(`Google Translate rejected the API key (HTTP ${status}${reason ? `, ${reason}` : ''})`);
  }
  if (status === 403) {
    return new AuthError(`Google Translate refused the request (HTTP 403, ${reason})`);
  }
  if (status === 400) {
    return new TranslationError('bad-request', `Google Translate bad request (HTTP 400${reason ? `, ${reason}` : ''})`);
  }
  return new TranslationError('unknown', `Google Translate error (HTTP ${status})`);
}

/**
 * Google Cloud Translation API v2 (the default provider).
 * POST https://translation.googleapis.com/language/translate/v2?key=API_KEY
 * with JSON {"q","source","target","format":"text"}; the translation is
 * data.translations[0].translatedText. "source" is omitted for auto-detect.
 */
export class GoogleCloudProvider implements TranslationProvider {
  readonly id = 'google';
  private readonly apiKey: string;
  private readonly fetchFn: FetchFn;

  constructor(apiKey: string, fetchFn: FetchFn = defaultFetch) {
    this.apiKey = apiKey;
    this.fetchFn = fetchFn;
  }

  private endpoint(): string {
    return `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(this.apiKey)}`;
  }

  async translate(text: string, from: string, to: string): Promise<string> {
    let res: Awaited<ReturnType<FetchFn>>;
    try {
      res = await this.fetchFn(this.endpoint(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: text,
          ...(from && from !== 'auto' ? { source: from } : {}),
          target: to,
          format: 'text',
        }),
      });
    } catch {
      throw new NetworkError();
    }
    const body = (await res.json().catch(() => null)) as
      | { data?: { translations?: Array<{ translatedText?: string }> } }
      | null;
    if (!res.ok) throw googleHttpError(res.status, body);
    const translated = body?.data?.translations?.[0]?.translatedText;
    if (typeof translated !== 'string') {
      throw new TranslationError('unknown', 'Google Translate returned an unexpected response');
    }
    return decodeHtmlEntities(translated);
  }

  /** Cheap key check for the Settings "Test connection" button (no translation billed). */
  async testConnection(): Promise<void> {
    const url =
      `https://translation.googleapis.com/language/translate/v2/languages` +
      `?key=${encodeURIComponent(this.apiKey)}&target=en`;
    let res: Awaited<ReturnType<FetchFn>>;
    try {
      res = await this.fetchFn(url, { method: 'GET' });
    } catch {
      throw new NetworkError();
    }
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw googleHttpError(res.status, body);
    }
  }

  /**
   * The languages this API key can use (GET .../languages?target=en).
   * Drives the pill's language menus so they always match the API —
   * e.g. Filipino ('fil') appears even though it is easy to miss in a
   * hand-written list.
   */
  async listLanguages(): Promise<Array<{ code: string; name: string }>> {
    const url =
      `https://translation.googleapis.com/language/translate/v2/languages` +
      `?key=${encodeURIComponent(this.apiKey)}&target=en`;
    let res: Awaited<ReturnType<FetchFn>>;
    try {
      res = await this.fetchFn(url, { method: 'GET' });
    } catch {
      throw new NetworkError();
    }
    const body = (await res.json().catch(() => null)) as
      | { data?: { languages?: Array<{ language?: string; name?: string }> } }
      | null;
    if (!res.ok) throw googleHttpError(res.status, body);
    const list = body?.data?.languages ?? [];
    return list
      .filter((l) => typeof l.language === 'string')
      .map((l) => ({ code: l.language as string, name: l.name ?? (l.language as string) }));
  }
}
