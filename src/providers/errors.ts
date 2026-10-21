/**
 * Typed translation failures. Messages are always safe to log: they never
 * contain an API key, a request URL, or a response body.
 */
export type TranslationErrorKind =
  | 'auth'
  | 'quota'
  | 'network'
  | 'timeout'
  | 'bad-request'
  | 'no-profile'
  | 'unknown';

export class TranslationError extends Error {
  readonly kind: TranslationErrorKind;
  constructor(kind: TranslationErrorKind, message: string) {
    super(message);
    this.name = 'TranslationError';
    this.kind = kind;
  }
}

export class AuthError extends TranslationError {
  constructor(message = 'The API key was rejected') {
    super('auth', message);
    this.name = 'AuthError';
  }
}

export class QuotaError extends TranslationError {
  constructor(message = 'The API key is out of quota') {
    super('quota', message);
    this.name = 'QuotaError';
  }
}

export class NetworkError extends TranslationError {
  constructor(message = 'Network error contacting the translation service') {
    super('network', message);
    this.name = 'NetworkError';
  }
}

export class TimeoutError extends TranslationError {
  constructor(message = 'The translation request timed out') {
    super('timeout', message);
    this.name = 'TimeoutError';
  }
}

export class NoProfileError extends TranslationError {
  constructor(
    message = 'No active API key profile. Add a key in Settings, or use the experimental keyless provider.',
  ) {
    super('no-profile', message);
    this.name = 'NoProfileError';
  }
}
