const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

function loadLibrary() {
  const cache = new Map();
  const data = new Map();
  const localStorage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
  function load(name) {
    const file = path.resolve(__dirname, '../src/lib', `${name}.ts`);
    if (cache.has(file)) return cache.get(file);
    const exports = {};
    cache.set(file, exports);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText;
    vm.runInNewContext(code, {
      exports, localStorage, window: { dispatchEvent() {} }, console,
      require: (dependency) => load(dependency.replace(/^\.\//, '')),
    });
    return exports;
  }
  return { calculateSplit: load('splitCalculation').calculateSplit, storage: load('storage') };
}

test('equal splits retain leftover paise and sum to the amount paid', () => {
  const { calculateSplit } = loadLibrary();
  const split = calculateSplit('100', 'equal', [{ name: 'A' }, { name: 'B' }], '');
  assert.equal(split.error, '');
  assert.equal(split.myShare, 33.34);
  assert.equal(split.toReceive, 66.66);
  assert.equal(split.members[0].pending, 33.33);
});

test('custom splits reject missing, duplicate, invalid and mismatched shares', () => {
  const { calculateSplit } = loadLibrary();
  assert.equal(calculateSplit('100', 'custom', [{ name: 'A', share: '70' }], '30').error, '');
  for (const [amount, people, own] of [
    ['100', [{ name: '', share: '70' }], '30'],
    ['100', [{ name: 'You', share: '70' }], '30'],
    ['100', [{ name: 'A', share: '35' }, { name: ' a ', share: '35' }], '30'],
    ['100', [{ name: 'A', share: '-1' }], '101'],
    ['100', [{ name: 'A', share: '' }], '100'],
    ['100', [{ name: 'A', share: '60' }], '30'],
    ['Infinity', [{ name: 'A', share: '70' }], '30'],
    ['0', [{ name: 'A', share: '0' }], '0'],
  ]) assert.ok(calculateSplit(amount, 'custom', people, own).error);
});

test('saved splits link to transactions and distinguish personal spending from full payment', () => {
  const { calculateSplit, storage } = loadLibrary();
  const split = calculateSplit('100', 'custom', [{ name: 'A', share: '70' }], '30');
  const transaction = storage.saveTransaction({
    date: '2026-09-13', description: 'Shared lunch', category: 'Food', account: 'cash',
    amount: split.myShare, type: 'expense', isSplit: true,
    splitDetails: {
      id: 'split-test', name: 'Team lunch', transactionId: '', totalAmount: 100, myShare: split.myShare,
      toReceive: split.toReceive, received: 0, pending: split.toReceive,
      splitMethod: 'custom', members: split.members, status: 'pending',
    },
  });
  assert.equal(transaction.amount, 30);
  assert.equal(storage.getTransactionAccountAmount(transaction), 100);
  const saved = storage.getSplitExpenses()[0];
  assert.equal(saved.transactionId, transaction.id);
  assert.equal(saved.name, 'Team lunch');
  assert.equal(transaction.splitDetails.name, 'Team lunch');
  assert.equal(saved.pending, 70);
  assert.equal(saved.members[0].name, 'A');
});
