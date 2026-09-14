import { Capacitor, registerPlugin } from '@capacitor/core';

export const GEMINI_KEY_CHANGED = 'wealthiq-gemini-key-changed';
export const GEMINI_SETTINGS_URL = '/settings#ai-assistant';
export const GEMINI_KEY_URL = 'https://aistudio.google.com/apikey';

interface SecureGeminiKeyPlugin {
  getKey(): Promise<{ key: string | null }>;
  hasKey(): Promise<{ saved: boolean }>;
  saveKey(options: { key: string }): Promise<void>;
  removeKey(): Promise<void>;
}
const nativeStore = registerPlugin<SecureGeminiKeyPlugin>('SecureGeminiKey');
export const usesNativeKeyStorage = () => Capacitor.getPlatform() === 'android';

type EncryptedKey = { key: CryptoKey; iv: Uint8Array<ArrayBuffer>; ciphertext: ArrayBuffer };
const DATABASE = 'wealthiq-private-credentials';
const STORE = 'credentials';
const RECORD = 'gemini';
const STORAGE_ERROR =
  'Secure key storage is unavailable. Use HTTPS or the Android app and allow device storage.';

async function openVault(): Promise<IDBDatabase> {
  if (
    typeof window === 'undefined' ||
    !window.isSecureContext ||
    !crypto.subtle ||
    !window.indexedDB
  ) {
    throw new Error(STORAGE_ERROR);
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error(STORAGE_ERROR));
    request.onblocked = () => reject(new Error('Close other app tabs and try again.'));
  });
}

async function accessVault<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const database = await openVault();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE, mode);
      const request = operation(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = transaction.onabort = () => reject(new Error(STORAGE_ERROR));
    });
  } finally {
    database.close();
  }
}

export async function hasGeminiKey(): Promise<boolean> {
  if (usesNativeKeyStorage()) return (await nativeStore.hasKey()).saved;
  return Boolean(await accessVault('readonly', (store) => store.getKey(RECORD)));
}

export async function getGeminiKey(): Promise<string | null> {
  if (usesNativeKeyStorage()) return (await nativeStore.getKey()).key;
  const record: EncryptedKey | undefined = await accessVault('readonly', (store) =>
    store.get(RECORD)
  );
  if (!record) return null;
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: record.iv },
      record.key,
      record.ciphertext
    );
    const bytes = new Uint8Array(plaintext);
    const key = new TextDecoder().decode(bytes);
    bytes.fill(0);
    return key;
  } catch {
    throw new Error(
      'Your saved key could not be unlocked. Remove it and save it again in Settings.'
    );
  }
}

function notifyChange() {
  window.dispatchEvent(new Event(GEMINI_KEY_CHANGED));
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel(GEMINI_KEY_CHANGED);
    channel.postMessage('changed');
    channel.close();
  }
}

export async function saveGeminiKey(value: string): Promise<void> {
  const key = value.trim();
  if (!key) throw new Error('Please enter a Gemini API key.');
  if (usesNativeKeyStorage()) {
    await nativeStore.saveKey({ key });
  } else {
    // Persist a non-exportable wrapping key, never the plaintext API key.
    const wrappingKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(key);
    let ciphertext: ArrayBuffer;
    try {
      ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, wrappingKey, plaintext);
    } finally {
      plaintext.fill(0);
    }
    await accessVault('readwrite', (store) =>
      store.put({ key: wrappingKey, iv, ciphertext }, RECORD)
    );
  }
  notifyChange();
}

export async function removeGeminiKey(): Promise<void> {
  if (usesNativeKeyStorage()) await nativeStore.removeKey();
  else await accessVault('readwrite', (store) => store.delete(RECORD));
  notifyChange();
}

export function subscribeToGeminiKey(callback: () => void): () => void {
  window.addEventListener(GEMINI_KEY_CHANGED, callback);
  window.addEventListener('focus', callback);
  const channel =
    typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(GEMINI_KEY_CHANGED) : null;
  if (channel) channel.onmessage = callback;
  return () => {
    window.removeEventListener(GEMINI_KEY_CHANGED, callback);
    window.removeEventListener('focus', callback);
    channel?.close();
  };
}
