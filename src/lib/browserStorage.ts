/** SSR-safe accessors for browser persistence. */
export function safeGetItem(key: string): string | null {
  if (typeof window === 'undefined') return null;

  try {
    return localStorage.getItem(key);
  } catch {
    return null;
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
