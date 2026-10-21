import { AuthError, NetworkError, QuotaError, TranslationError } from './errors';
import type { TranslationProvider } from './TranslationProvider';
import type { FetchFn } from './GoogleCloudProvider';

const defaultFetch: FetchFn = (url, init) =>
  fetch(url, init) as ReturnType<FetchFn>;

/**
 * KBMK's canonical codes are Google v2's (the pill's lists and cache
 * keys use them). Azure spells a few differently — translate at the
 * boundary, in both directions.
 */
const TO_AZURE: Record<string, string> = {
  'zh-CN': 'zh-Hans',
  'zh-TW': 'zh-Hant',
  iw: 'he',
  tl: 'fil',
  no: 'nb',
};
const FROM_AZURE: Record<string, string> = {
  'zh-Hans': 'zh-CN',
  'zh-Hant': 'zh-TW',
  nb: 'no',
};

export function azureLangCode(code: string): string {
  return TO_AZURE[code] ?? code;
}
export function canonicalLangCode(azureCode: string): string {
  return FROM_AZURE[azureCode] ?? azureCode;
}

interface AzureErrorBody {
  error?: { code?: number; message?: string };
}

/** Map an Azure failure to a typed error — never echoing the key. */
export function azureHttpError(status: number, body: unknown): TranslationError {
  const code = (body as AzureErrorBody)?.error?.code;
  if (status === 429 || code === 429000 || code === 429001) {
    return new QuotaError(`Azure Translator quota/rate limit reached (HTTP ${status})`);
  }
  if (status === 401 || status === 403) {
    return new AuthError(
      `Azure Translator rejected the key or region (HTTP ${status}). Check the key and that the region matches the resource in the Azure portal.`,
    );
  }
  if (status === 400) {
    return new TranslationError('bad-request', `Azure Translator bad request (HTTP 400)`);
  }
  return new TranslationError('unknown', `Azure Translator error (HTTP ${status})`);
}

/**
 * Microsoft Azure Translator (M4.3, second provider type).
 * POST {endpoint}/translate?api-version=3.0&from=..&to=..
 * with headers Ocp-Apim-Subscription-Key (+ Region unless the resource
 * is 'global') and body [{"text": "..."}]; the translation is
 * [0].translations[0].text. Free F0 tier: 2M characters/month.
 */
export class AzureTranslatorProvider implements TranslationProvider {
  readonly id = 'azure';
  private readonly apiKey: string;
  private readonly region: string;
  private readonly fetchFn: FetchFn;
  private readonly endpoint: string;

  constructor(
    apiKey: string,
    region: string,
    fetchFn: FetchFn = defaultFetch,
    endpoint = 'https://api.cognitive.microsofttranslator.com',
  ) {
    this.apiKey = apiKey;
    this.region = region;
    this.fetchFn = fetchFn;
    this.endpoint = endpoint;
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      'Ocp-Apim-Subscription-Key': this.apiKey,
      'Content-Type': 'application/json',
    };
    // Regional resources need their region; a 'global' resource must not send one.
    if (this.region && this.region.toLowerCase() !== 'global') {
      headers['Ocp-Apim-Subscription-Region'] = this.region;
    }
    return headers;
  }

  async translate(text: string, from: string, to: string): Promise<string> {
    const params = new URLSearchParams({ 'api-version': '3.0', to: azureLangCode(to) });
    if (from && from !== 'auto') params.set('from', azureLangCode(from));
    let res: Awaited<ReturnType<FetchFn>>;
    try {
      res = await this.fetchFn(`${this.endpoint}/translate?${params.toString()}`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify([{ text }]),
      });
    } catch {
      throw new NetworkError();
    }
    const body = (await res.json().catch(() => null)) as
      | Array<{ translations?: Array<{ text?: string }> }>
      | AzureErrorBody
      | null;
    if (!res.ok) throw azureHttpError(res.status, body);
    const translated = Array.isArray(body) ? body[0]?.translations?.[0]?.text : undefined;
    if (typeof translated !== 'string') {
      throw new TranslationError('unknown', 'Azure Translator returned an unexpected response');
    }
    return translated;
  }

  /** Settings "Test connection": one tiny billed translation proves key + region. */
  async testConnection(): Promise<void> {
    await this.translate('Hi', 'en', 'es');
  }

  /** Azure's supported list (public endpoint), mapped back to canonical codes. */
  async listLanguages(): Promise<Array<{ code: string; name: string }>> {
    let res: Awaited<ReturnType<FetchFn>>;
    try {
      res = await this.fetchFn(`${this.endpoint}/languages?api-version=3.0`, {
        method: 'GET',
      });
    } catch {
      throw new NetworkError();
    }
    const body = (await res.json().catch(() => null)) as {
      translation?: Record<string, { name?: string }>;
    } | null;
    if (!res.ok) throw azureHttpError(res.status, body);
    const translation = body?.translation ?? {};
    return Object.entries(translation).map(([code, info]) => ({
      code: canonicalLangCode(code),
      name: info?.name ?? code,
    }));
  }
}
