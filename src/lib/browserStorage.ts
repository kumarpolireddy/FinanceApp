/** SSR-safe accessors for browser persistence. */
export function safeGetItem(key: string): string | null {
  if (typeof window === 'undefined') return null;

  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Read JSON with the same fallback for missing, inaccessible, or malformed data. */
export function readStoredJson<T>(key: string, fallback: T): T {
  const data = safeGetItem(key);
  if (!data) return fallback;

  try {
    return JSON.parse(data) as T;
  } catch {
    return fallback;
  }
}

export function safeSetItem(key: string, value: string): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(key, value);
  } catch (error) {
    console.error('Failed to set localStorage item', key, error);
  }
}
