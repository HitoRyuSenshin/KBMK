import { TranslationCache, cacheKey } from './TranslationCache';
import { TimeoutError, TranslationError } from './errors';

export interface AttemptResult {
  text: string;
  providerId: string;
  profileId?: string;
  profileLabel?: string;
  switchedFromLabel?: string;
}

/** Performs one (router-mediated) translation attempt. */
export type AttemptFn = (
  text: string,
  from: string,
  to: string,
) => Promise<AttemptResult>;

export interface TranslateOutcome extends AttemptResult {
  cached: boolean;
  durationMs: number;
}

export interface TranslationServiceOptions {
  cacheSize?: number;
  timeoutMs?: number;
  maxConcurrent?: number;
  retryDelayMs?: number;
}

/**
 * Translation front door (spec): LRU cache, in-flight de-duplication,
 * at most 5 concurrent requests, a 2 s timeout per attempt, and exactly
 * one retry for transient failures. Auth/quota failures are never
 * retried here — the router handles those (profile marking/fallback).
 * Nothing here blocks the caller beyond the returned promise, and word
 * completion never awaits it on the typing path.
 */
export class TranslationService {
  readonly cache: TranslationCache;
  private readonly attempt: AttemptFn;
  private readonly timeoutMs: number;
  private readonly retryDelayMs: number;
  private readonly maxConcurrent: number;
  private readonly inFlight = new Map<string, Promise<TranslateOutcome>>();
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(attempt: AttemptFn, options: TranslationServiceOptions = {}) {
    this.attempt = attempt;
    this.cache = new TranslationCache(options.cacheSize ?? 500);
    this.timeoutMs = options.timeoutMs ?? 2000;
    this.retryDelayMs = options.retryDelayMs ?? 150;
    this.maxConcurrent = options.maxConcurrent ?? 5;
  }

  async translate(text: string, from: string, to: string): Promise<TranslateOutcome> {
    const key = cacheKey(text, from, to);
    const hit = this.cache.get(key);
    if (hit !== undefined) {
      return {
        text: hit,
        cached: true,
        providerId: 'cache',
        durationMs: 0,
      };
    }
    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const run = this.runAttempt(text, from, to, key);
    this.inFlight.set(key, run);
    try {
      return await run;
    } finally {
      this.inFlight.delete(key);
    }
  }

  private async runAttempt(
    text: string,
    from: string,
    to: string,
    key: string,
  ): Promise<TranslateOutcome> {
    const started = Date.now();
    await this.acquire();
    try {
      const result = await this.attemptWithRetry(text, from, to);
      this.cache.set(key, result.text);
      return { ...result, cached: false, durationMs: Date.now() - started };
    } finally {
      this.release();
    }
  }

  private async attemptWithRetry(
    text: string,
    from: string,
    to: string,
  ): Promise<AttemptResult> {
    try {
      return await this.withTimeout(this.attempt(text, from, to));
    } catch (error) {
      if (
        error instanceof TranslationError &&
        (error.kind === 'auth' || error.kind === 'quota' || error.kind === 'no-profile')
      ) {
        throw error;
      }
      await new Promise((r) => setTimeout(r, this.retryDelayMs));
      return this.withTimeout(this.attempt(text, from, to));
    }
  }

  private withTimeout<T>(promise: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new TimeoutError(`Translation timed out after ${this.timeoutMs} ms`)),
        this.timeoutMs,
      );
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          reject(error as Error);
        },
      );
    });
  }

  private acquire(): Promise<void> {
    if (this.active < this.maxConcurrent) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.waiters.push(() => {
        this.active++;
        resolve();
      });
    });
  }

  private release(): void {
    this.active--;
    const next = this.waiters.shift();
    if (next) next();
  }
}
