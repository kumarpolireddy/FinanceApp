import Link from 'next/link';
import { GEMINI_KEY_URL, GEMINI_SETTINGS_URL } from '@/lib/geminiKeyStorage';
import { REVOKED_KEY_MESSAGE } from '@/lib/geminiClient';

export default function GeminiSetupNotice({
  invalid = false,
  storageError = false,
}: {
  invalid?: boolean;
  storageError?: boolean;
}) {
  return (
    <div
      role="status"
      className="mb-3 rounded-xl border border-border bg-card p-4 space-y-3 text-sm"
    >
      <h2 className="font-semibold">AI Assistant setup required</h2>
      <p className="text-muted-foreground">
        {invalid
          ? REVOKED_KEY_MESSAGE
          : storageError
            ? 'Your saved key could not be unlocked. Remove it and save it again in Settings.'
            : 'Add your Gemini API key in Settings to start using the AI Assistant.'}
      </p>
      <div className="flex flex-wrap gap-2">
        <Link
          href={GEMINI_SETTINGS_URL}
          className="rounded-lg bg-primary px-3 py-2 text-primary-foreground"
        >
          {invalid || storageError ? 'Update API Key' : 'Go to Settings'}
        </Link>
        <a
          href={GEMINI_KEY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border border-border px-3 py-2"
        >
          Get API Key
        </a>
      </div>
    </div>
  );
}
