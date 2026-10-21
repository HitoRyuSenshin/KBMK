import { NetworkError, QuotaError, TranslationError } from './errors';
import type { TranslationProvider } from './TranslationProvider';
import type { FetchFn } from './GoogleCloudProvider';

/**
 * Unofficial "GTX" endpoint — free, keyless, may be rate limited.
 * Labelled "experimental" in Settings.
 * GET https://translate.googleapis.com/translate_a/single?client=gtx&sl=..&tl=..&dt=t&q=..
 * Response: [[["translated","original",…], …], …] — segments are joined.
 */
export class UnofficialGtxProvider implements TranslationProvider {
  readonly id = 'gtx';
  private readonly fetchFn: FetchFn;

  constructor(fetchFn: FetchFn = (url, init) => fetch(url, init) as ReturnType<FetchFn>) {
    this.fetchFn = fetchFn;
  }

  async translate(text: string, from: string, to: string): Promise<string> {
    const params = new URLSearchParams({
      client: 'gtx',
      sl: from || 'auto',
      tl: to,
      dt: 't',
      q: text,
    });
    let res: Awaited<ReturnType<FetchFn>>;
    try {
      res = await this.fetchFn(
        `https://translate.googleapis.com/translate_a/single?${params.toString()}`,
        {
          method: 'GET',
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        },
      );
    } catch {
      throw new NetworkError();
    }
    if (res.status === 429) throw new QuotaError('The experimental provider is rate limited');
    if (!res.ok) {
      throw new TranslationError('unknown', `Experimental provider error (HTTP ${res.status})`);
    }
    const body = (await res.json().catch(() => null)) as unknown;
    const segments = Array.isArray(body) ? (body[0] as unknown) : null;
    if (!Array.isArray(segments)) {
      throw new NetworkError('The experimental provider returned an unexpected response');
    }
    const translated = segments
      .map((seg) => (Array.isArray(seg) && typeof seg[0] === 'string' ? seg[0] : ''))
      .join('');
    if (!translated) {
      throw new NetworkError('The experimental provider returned an empty translation');
    }
    return translated;
  }
}
