import { describe, expect, it } from 'vitest';
import { DEFAULT_STATE } from '../src/shared/types';
import { statusText, withEnabled, withLanguages, withSwap } from '../src/shared/state';
import { FakeKeyHook } from '../src/hook/KeyHook';
import { FakeTextInjector } from '../src/inject/TextInjector';
import { MockProvider } from '../src/providers/TranslationProvider';

describe('app state transitions', () => {
  it('pausing sets status Paused and resuming sets Ready', () => {
    const paused = withEnabled(DEFAULT_STATE, false);
    expect(paused.enabled).toBe(false);
    expect(paused.status).toBe('Paused');
    expect(withEnabled(paused, true).status).toBe('Ready');
  });

  it('changing languages while paused stays Paused', () => {
    const paused = withEnabled(DEFAULT_STATE, false);
    expect(withLanguages(paused, 'auto', 'bn').status).toBe('Paused');
  });

  it('refuses "auto" as a target', () => {
    expect(withLanguages(DEFAULT_STATE, 'en', 'auto')).toEqual(DEFAULT_STATE);
  });

  it('swap goes through the language rules', () => {
    expect(withSwap(DEFAULT_STATE)).toMatchObject({ source: 'es', target: 'en' });
  });

  it('formats Replaced with milliseconds only when present', () => {
    expect(statusText({ ...DEFAULT_STATE, status: 'Replaced', lastReplaceMs: 123 })).toBe(
      'Replaced (123 ms)',
    );
    expect(statusText({ ...DEFAULT_STATE, status: 'Replaced' })).toBe('Replaced');
    expect(statusText(DEFAULT_STATE)).toBe('Ready');
  });
});

describe('M1 interfaces with fakes', () => {
  it('FakeKeyHook suppresses events while injecting (own-output guard)', () => {
    const hook = new FakeKeyHook();
    const seen: string[] = [];
    hook.start((e) => seen.push(e.type));
    hook.emit({ type: 'char', char: 'a' });
    hook.setInjecting(true);
    hook.emit({ type: 'char', char: 'x' });
    hook.setInjecting(false);
    hook.emit({ type: 'delimiter', char: ' ' });
    expect(seen).toEqual(['char', 'delimiter']);
  });

  it('FakeTextInjector records replacement calls without touching input', async () => {
    const injector = new FakeTextInjector();
    await injector.replaceWord(5, 'hola', ' ');
    expect(injector.calls).toEqual([{ wordLength: 5, replacement: 'hola', delimiter: ' ' }]);
  });

  it('MockProvider is visibly a mock', async () => {
    await expect(new MockProvider().translate('hello', 'en', 'es')).resolves.toBe('[es] hello');
  });
});
