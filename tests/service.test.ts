import { describe, expect, it } from 'vitest';
import { TranslationService, type AttemptResult } from '../src/providers/TranslationService';
import { AuthError, NetworkError, QuotaError } from '../src/providers/errors';

const ok = (text: string): AttemptResult => ({ text, providerId: 'fake' });
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('TranslationService', () => {
  it('caches by word|from|to and reports cache hits without a new attempt', async () => {
    let calls = 0;
    const service = new TranslationService(async () => {
      calls++;
      return ok('hola');
    });
    const first = await service.translate('hello', 'en', 'es');
    const second = await service.translate('hello', 'en', 'es');
    const otherTarget = await service.translate('hello', 'en', 'bn');
    expect(first.cached).toBe(false);
    expect(second).toMatchObject({ text: 'hola', cached: true, providerId: 'cache' });
    expect(otherTarget.cached).toBe(false);
    expect(calls).toBe(2);
  });

  it('de-duplicates concurrent requests for the same word', async () => {
    let calls = 0;
    const service = new TranslationService(async () => {
      calls++;
      await delay(20);
      return ok('hola');
    });
    const results = await Promise.all([
      service.translate('hello', 'en', 'es'),
      service.translate('hello', 'en', 'es'),
      service.translate('hello', 'en', 'es'),
    ]);
    expect(calls).toBe(1);
    expect(results.every((r) => r.text === 'hola')).toBe(true);
  });

  it('never runs more than 5 attempts concurrently', async () => {
    let active = 0;
    let maxActive = 0;
    const service = new TranslationService(async (text) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await delay(15);
      active--;
      return ok(text.toUpperCase());
    });
    await Promise.all(
      Array.from({ length: 9 }, (_, i) => service.translate(`w${i}`, 'en', 'es')),
    );
    expect(maxActive).toBe(5);
  });

  it('retries a transient failure exactly once, then succeeds', async () => {
    let calls = 0;
    const service = new TranslationService(
      async () => {
        calls++;
        if (calls === 1) throw new NetworkError();
        return ok('hola');
      },
      { retryDelayMs: 1 },
    );
    await expect(service.translate('hello', 'en', 'es')).resolves.toMatchObject({ text: 'hola' });
    expect(calls).toBe(2);
  });

  it('does not retry auth or quota failures at this layer', async () => {
    let authCalls = 0;
    const authService = new TranslationService(async () => {
      authCalls++;
      throw new AuthError();
    });
    await expect(authService.translate('x', 'en', 'es')).rejects.toBeInstanceOf(AuthError);
    expect(authCalls).toBe(1);

    let quotaCalls = 0;
    const quotaService = new TranslationService(async () => {
      quotaCalls++;
      throw new QuotaError();
    });
    await expect(quotaService.translate('x', 'en', 'es')).rejects.toBeInstanceOf(QuotaError);
    expect(quotaCalls).toBe(1);
  });

  it('times out a slow attempt with TimeoutError', async () => {
    const service = new TranslationService(
      async () => {
        await delay(200);
        return ok('late');
      },
      { timeoutMs: 30, retryDelayMs: 1 },
    );
    await expect(service.translate('x', 'en', 'es')).rejects.toMatchObject({ kind: 'timeout' });
  });
});
