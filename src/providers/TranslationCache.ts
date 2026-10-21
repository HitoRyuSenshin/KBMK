/** LRU cache for translations. Key format (spec): `word|from|to`. */
export function cacheKey(text: string, from: string, to: string): string {
  return `${text}|${from}|${to}`;
}

export class TranslationCache {
  private readonly map = new Map<string, string>();
  private readonly capacity: number;

  constructor(capacity = 500) {
    this.capacity = Math.max(1, capacity);
  }

  get size(): number {
    return this.map.size;
  }

  get(key: string): string | undefined {
    const value = this.map.get(key);
    if (value === undefined) return undefined;
    // Refresh recency.
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: string, value: string): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.capacity) {
      const oldest = this.map.keys().next().value as string;
      this.map.delete(oldest);
    }
  }

  clear(): void {
    this.map.clear();
  }
}
