import type { AppState } from './types';
import { swappedLanguages } from './languages';

/** Pure state transitions — shared by main (authoritative) and unit tests. */

export function withEnabled(state: AppState, enabled: boolean): AppState {
  return {
    ...state,
    enabled,
    status: enabled ? 'Ready' : 'Paused',
  };
}

export function withLanguages(
  state: AppState,
  source: string,
  target: string,
): AppState {
  // Target may never be "auto"; ignore an invalid change entirely.
  if (target === 'auto') return state;
  return { ...state, source, target, status: state.enabled ? 'Ready' : 'Paused' };
}

export function withSwap(state: AppState): AppState {
  const next = swappedLanguages(state.source, state.target);
  return withLanguages(state, next.source, next.target);
}

export function statusText(state: AppState): string {
  if (state.status === 'Replaced' && state.lastReplaceMs != null) {
    return `Replaced (${state.lastReplaceMs} ms)`;
  }
  return state.status;
}
