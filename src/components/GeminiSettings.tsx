'use client';

import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import {
  GEMINI_KEY_URL,
  hasGeminiKey,
  removeGeminiKey,
  saveGeminiKey,
  subscribeToGeminiKey,
  usesNativeKeyStorage,
} from '@/lib/geminiKeyStorage';
import { GeminiError, testGeminiConnection } from '@/lib/geminiClient';

export default function GeminiSettings() {
  const keyInput = useRef<HTMLInputElement>(null);
  const [saved, setSaved] = useState(false);
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState<'save' | 'test' | 'remove' | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const [native, setNative] = useState(false);

  useEffect(() => {
    let active = true;
    setNative(usesNativeKeyStorage());
    const refresh = () =>
      hasGeminiKey()
        .then((value) => {
          if (active) {
            setSaved(value);
            setReady(true);
          }
        })
        .catch(() => {
          if (active) {
            setReady(false);
            setError(true);
            setMessage(
              'Secure storage is unavailable. Use HTTPS or the updated Android app and allow device storage.'
            );
          }
        });
    void refresh();
    const unsubscribe = subscribeToGeminiKey(refresh);
    const clear = () => {
      if (document.hidden) {
        if (keyInput.current) keyInput.current.value = '';
        setVisible(false);
      }
    };
    document.addEventListener('visibilitychange', clear);
    return () => {
      active = false;
      unsubscribe();
      document.removeEventListener('visibilitychange', clear);
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => setVisible(false), 10000);
    return () => clearTimeout(timer);
  }, [visible]);

  async function perform(action: 'save' | 'test' | 'remove') {
    if (busy) return;
    setError(false);
    setMessage('');
    let draft = keyInput.current?.value.trim() || '';
    if ((action === 'save' && !draft) || (action === 'test' && !draft && !saved)) {
      setError(true);
      setMessage('Please enter a Gemini API key.');
      return;
    }
    setBusy(action);
    setVisible(false);
    try {
      if (action === 'remove') {
        await removeGeminiKey();
        setSaved(false);
        setMessage('API key removed.');
      } else if (action === 'test') {
        await testGeminiConnection(draft || undefined);
        setMessage(
          draft
            ? 'Connection successful. Select Save Key to keep this key.'
            : 'Connection successful'
        );
      } else {
        await saveGeminiKey(draft);
        setSaved(true);
        setMessage('API key saved.');
      }
      if (action !== 'test' && keyInput.current) keyInput.current.value = '';
    } catch (failure) {
      setError(true);
      setMessage(
        failure instanceof GeminiError
          ? failure.message
          : 'Unable to update secure key storage. Please try again.'
      );
    } finally {
      draft = '';
      setBusy(null);
    }
  }

  const button =
    'rounded-lg border border-border px-4 py-2 text-sm font-medium disabled:opacity-50';
  return (
    <section
      id="ai-assistant"
      aria-labelledby="ai-assistant-title"
      className="scroll-mt-6 rounded-xl border border-border bg-card p-5 space-y-4"
    >
      <div>
        <h2 id="ai-assistant-title" className="text-lg font-semibold text-foreground">
          AI Assistant
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect your own Gemini API key to use the AI Assistant.
        </p>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void perform('save');
        }}
        className="space-y-3"
      >
        <label htmlFor="gemini-key" className="block text-sm font-medium">
          Gemini API Key
        </label>
        <div className="relative">
          <input
            id="gemini-key"
            ref={keyInput}
            type={visible ? 'text' : 'password'}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            disabled={!ready || Boolean(busy)}
            placeholder={saved ? 'Key saved — enter a replacement' : 'Enter your Gemini API key'}
            aria-describedby="gemini-storage-info"
            onBlur={() => setVisible(false)}
            className="w-full rounded-lg border border-border bg-background p-3 pr-12 text-sm outline-none focus:border-primary"
          />
          <button
            type="button"
            aria-label={visible ? 'Hide API key' : 'Show API key'}
            aria-pressed={visible}
            disabled={!ready || Boolean(busy)}
            onClick={() => setVisible((value) => !value)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-muted-foreground"
          >
            {visible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={!ready || Boolean(busy)}
            className={`${button} bg-primary text-primary-foreground`}
          >
            {busy === 'save' ? 'Saving…' : 'Save Key'}
          </button>
          <button
            type="button"
            disabled={!ready || Boolean(busy)}
            onClick={() => void perform('test')}
            className={button}
          >
            {busy === 'test' ? 'Testing…' : 'Test Connection'}
          </button>
          {saved && (
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => void perform('remove')}
              className={`${button} text-negative`}
            >
              {busy === 'remove' ? 'Removing…' : 'Remove Key'}
            </button>
          )}
        </div>
      </form>
      <p id="gemini-storage-info" className="text-xs text-muted-foreground">
        {native
          ? 'Your API key is stored securely on this device and is not included with the app.'
          : 'Your API key is stored encrypted in this browser and is not included with the app. Browser storage is not an OS keychain; scripts running in this app can access it. Use only a trusted device.'}
      </p>
      <p className="text-xs text-muted-foreground">
        Your key and AI requests go directly to Google. Testing sends a short prompt without your
        financial data.
      </p>
      <a
        href={GEMINI_KEY_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block text-sm text-primary underline"
      >
        Get Gemini API Key
      </a>
      {message && (
        <p
          role={error ? 'alert' : 'status'}
          className={`text-sm ${error ? 'text-negative' : 'text-positive'}`}
        >
          {message}
        </p>
      )}
    </section>
  );
}
