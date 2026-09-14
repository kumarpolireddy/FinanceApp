# Gemini BYOK

Settings → AI Assistant (also `/settings#ai-assistant`) accepts a user's Gemini API key. The password input is never prefilled from storage. Save and Remove clear the input; showing it lasts at most ten seconds. Leaving the browser tab clears unsaved input. Test Connection sends only a short prompt, without financial data, and can incur a small Google API charge.

The chatbot checks configuration before enabling input, and retrieves the current key again before every request. Requests go directly to Google's HTTPS Gemini endpoint using `x-goog-api-key`, without cookies, URL credentials, redirects, or a developer-key fallback. The former server endpoint returns HTTP 410 and cannot make Gemini requests. Upstream errors are mapped to fixed messages rather than logged or persisted in chat history.

## Storage boundaries

- Android uses an AES-GCM key generated inside Android Keystore. Only ciphertext and its IV are written to the app's private no-backup directory. The wrapping key is non-exportable. The Capacitor plugin exposes only operations for this credential. Bridge logging is disabled because plugin arguments can contain secrets.
- Web uses AES-GCM with a non-exportable Web Crypto key, stored together with ciphertext in a dedicated IndexedDB database. Nothing is stored in the finance database, localStorage, exports, or chat history. This requires HTTPS (or localhost). A browser cannot provide an OS keychain: same-origin scripts can decrypt the credential, and clearing site data deletes it. The UI states this limitation.
- Plaintext necessarily exists briefly in the input and request memory. JavaScript strings cannot be reliably zeroized; the implementation avoids persistent plaintext storage, React key state, and logging. Android byte buffers and browser encryption/decryption buffers are cleared when possible.
- The saved credential is device/browser-profile scoped, matching the app's current local-guest architecture. It is not tied to a cloud login and is not included in finance exports. Use Remove Key when leaving a shared device.

## Build and verification

No Gemini environment variable is required. Never add a developer key to public environment variables or committed configuration.

Production Android loads bundled `out` assets. For explicit development live reload only, set `CAPACITOR_DEV_SERVER_URL` when copying Capacitor assets. Omit it for distribution. After a web build, run `npx cap copy android` to propagate assets and logging configuration, then rebuild Android so the registered secure-storage plugin is included.

Automated checks:

```text
node tests/geminiByok.test.cjs
npm run type-check
npm run build
cd android
gradlew.bat :app:compileDebugJavaWithJavac --offline
```

The regression tests use mocked Gemini responses and an IndexedDB harness with real Web Crypto; they never use a real API key. They cover encryption/reload/replacement/removal, native dispatch, missing-key blocking, fresh key retrieval, header-only authentication, sanitized failures, and the minimal test prompt. Device keystore persistence and visual interaction still require an Android device/browser smoke test.

Manual smoke test: open chat without a key, follow Go to Settings, save/test your own key, send a message, restart the app and retry, then remove the key and confirm chat is blocked. Also test a revoked key, a quota failure, and `/settings#ai-assistant` navigation. Do not paste production credentials into test logs or screenshots.

References: [Google Gemini authentication](https://ai.google.dev/api), [Android Keystore](https://developer.android.com/privacy-and-security/keystore), [Web Crypto keys](https://developer.mozilla.org/en-US/docs/Web/API/CryptoKey).
