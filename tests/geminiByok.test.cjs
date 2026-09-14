const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { test } = require('node:test');
const ts = require('typescript');

// Minimal transactional IndexedDB harness; uses real Web Crypto and structured cloning.
function vaultHarness() {
  const records = new Map();
  let fail = false;
  const database = {
    createObjectStore() {}, close() {},
    transaction() {
      const transaction = {
        objectStore() {
          const operation = (action) => {
            const request = {};
            queueMicrotask(() => {
              if (fail) { transaction.onabort(); return; }
              request.result = action();
              transaction.oncomplete();
            });
            return request;
          };
          return {
            get: (key) => operation(() => structuredClone(records.get(key))),
            getKey: (key) => operation(() => records.has(key) ? key : undefined),
            put: (value, key) => operation(() => { records.set(key, structuredClone(value)); return key; }),
            delete: (key) => operation(() => records.delete(key)),
          };
        },
      };
      return transaction;
    },
  };
  const indexedDB = { open() {
    const request = { result: database };
    queueMicrotask(() => request.onsuccess());
    return request;
  } };
  return { indexedDB, records, fail: () => { fail = true; } };
}

function loadModules({ native = false, nativeStore = {}, savedKey, fetchImpl, vault = vaultHarness() } = {}) {
  const cache = new Map();
  const window = new EventTarget();
  window.isSecureContext = true;
  window.indexedDB = vault.indexedDB;
  function load(name) {
    if (cache.has(name)) return cache.get(name);
    const exports = {};
    cache.set(name, exports);
    const source = fs.readFileSync(path.join(__dirname, '../src/lib', `${name}.ts`), 'utf8');
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    vm.runInNewContext(code, {
      exports, crypto: webcrypto, indexedDB: vault.indexedDB, window, Event,
      TextEncoder, TextDecoder, Uint8Array, AbortController, setTimeout, clearTimeout,
      fetch: fetchImpl || (() => { throw new Error('Unexpected network request'); }),
      // Neither legacy environment setting may be used.
      process: { env: { GEMINI_API_KEY: 'developer-key-must-not-be-used', NEXT_PUBLIC_GEMINI_API_KEY: 'developer-key-must-not-be-used' } },
      require(name) {
        if (name === '@capacitor/core') return { Capacitor: { getPlatform: () => native ? 'android' : 'web' }, registerPlugin: () => nativeStore };
        if (name === './geminiKeyStorage' && savedKey) return { getGeminiKey: savedKey };
        return load(name.replace('./', ''));
      },
    });
    return exports;
  }
  return { storage: load('geminiKeyStorage'), client: load('geminiClient'), vault, window };
}

test('browser key is encrypted, non-exportable, replaceable and removable across reloads', async () => {
  const { storage, vault } = loadModules();
  assert.equal(await storage.hasGeminiKey(), false);
  assert.equal(await storage.getGeminiKey(), null);
  await assert.rejects(storage.saveGeminiKey('  '), /enter a Gemini API key/);
  await storage.saveGeminiKey('  user-test-key  ');
  assert.equal(await storage.hasGeminiKey(), true);
  const record = vault.records.get('gemini');
  assert.equal(record.key.extractable, false);
  assert.equal(Buffer.from(record.ciphertext).includes(Buffer.from('user-test-key')), false);
  await assert.rejects(webcrypto.subtle.exportKey('raw', record.key));
  const reloaded = loadModules({ vault }).storage;
  assert.equal(await reloaded.getGeminiKey(), 'user-test-key');
  await reloaded.saveGeminiKey('replacement-key');
  assert.notDeepEqual(vault.records.get('gemini').iv, record.iv);
  assert.equal(await storage.getGeminiKey(), 'replacement-key');
  await storage.removeGeminiKey();
  assert.equal(await reloaded.getGeminiKey(), null);
  assert.equal(vault.records.size, 0);
});

test('storage failure never reports success or falls back to plaintext', async () => {
  const { storage, vault } = loadModules();
  vault.fail();
  await assert.rejects(storage.saveGeminiKey('user-test-key'), /Secure key storage/);
  assert.equal(vault.records.size, 0);
});

test('Android uses the native keystore exclusively', async () => {
  const calls = [];
  const { storage, vault } = loadModules({ native: true, nativeStore: {
    hasKey: async () => ({ saved: true }), getKey: async () => ({ key: 'native-test-key' }),
    saveKey: async ({ key }) => calls.push(key), removeKey: async () => calls.push('removed'),
  } });
  await storage.saveGeminiKey('native-test-key');
  assert.equal(await storage.getGeminiKey(), 'native-test-key');
  await storage.removeGeminiKey();
  assert.deepEqual(calls, ['native-test-key', 'removed']);
  assert.equal(vault.records.size, 0);
});

test('missing key blocks all network calls even when developer environment keys exist', async () => {
  const { client } = loadModules({ savedKey: async () => null });
  await assert.rejects(client.sendGeminiDirect([{ role: 'user', content: 'Hello' }]), (error) => error.code === 'missing-key');
});

test('each request retrieves the current user key; key stays out of URL and body', async () => {
  let key = 'first-test-key';
  const requests = [];
  const { client } = loadModules({ savedKey: async () => key, fetchImpl: async (url, options) => {
    requests.push({ url, options });
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'OK' }] } }] }) };
  } });
  await client.sendGeminiDirect([{ role: 'user', content: 'Hello' }]);
  key = 'second-test-key';
  await client.sendGeminiDirect([{ role: 'user', content: 'Again' }]);
  assert.deepEqual(requests.map((request) => request.options.headers['x-goog-api-key']), ['first-test-key', 'second-test-key']);
  for (const { url, options } of requests) {
    assert.equal(url.includes('?'), false);
    assert.equal(options.body.includes('test-key'), false);
    assert.equal(options.redirect, 'error');
  }
  key = null;
  await assert.rejects(client.sendGeminiDirect([{ role: 'user', content: 'After removal' }]), (error) => error.code === 'missing-key');
  assert.equal(requests.length, 2);
});

test('invalid, revoked, and quota errors are understandable without echoing server secrets', async () => {
  for (const status of [400, 401, 403, 429, 500]) {
    const { client } = loadModules({ savedKey: async () => 'user-test-key', fetchImpl: async () => ({
      ok: false, status, json: async () => ({ error: { message: 'API key not valid: SECRET-MUST-NOT-LEAK' } }),
    }) });
    await assert.rejects(client.sendGeminiDirect([{ role: 'user', content: 'Hi' }]), (error) => {
      assert.equal(error.message.includes('SECRET'), false);
      assert.equal(error.code, status === 429 ? 'quota' : status === 500 ? 'request' : 'invalid-key');
      return true;
    });
    if (status === 400) await assert.rejects(client.testGeminiConnection('draft'), /Invalid API key/);
  }
});

test('connection test uses a minimal prompt without financial context', async () => {
  let body;
  const { client } = loadModules({ fetchImpl: async (_url, options) => {
    body = JSON.parse(options.body);
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'OK' }] } }] }) };
  } });
  await client.testGeminiConnection('draft-test-key');
  assert.equal(body.systemInstruction, undefined);
  assert.equal(body.contents[0].parts[0].text, 'Reply with OK.');
  assert.equal(body.generationConfig.maxOutputTokens, 64);
});
