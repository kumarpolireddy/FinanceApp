const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/app/accounts/accountGroups.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, context);
const options = (...args) => Array.from(context.exports.getAccountGroupOptions(...args));
const { renameAccountGroup } = context.exports;

test('renaming updates hidden accounts and the saved definition without changing identity or type', () => {
  const accounts = [{ id: 'a', category: 'Credit Cards', type: 'credit', groupUid: 'g' },
    { id: 'b', category: 'Credit Cards', type: 'credit', visible: false }];
  const categories = [{ id: 'g', sourceUid: 'g', name: 'Credit Cards', baseType: 'credit' }];
  const result = renameAccountGroup(accounts, categories, 'Credit Cards', 'Travel');
  assert.ok(result.accounts.every((account) => account.category === 'Travel' && account.type === 'credit'));
  assert.equal(result.accounts[0].groupUid, 'g');
  assert.equal(result.accounts[1].visible, false);
  assert.equal(result.categories[0].id, 'g');
  assert.deepEqual(options('credit', result.accounts, result.categories), ['Travel']);
  assert.equal(accounts[0].category, 'Credit Cards');
});

test('renaming an unregistered group creates its definition and prevents accidental merges', () => {
  const accounts = [{ category: 'Travel', type: 'credit' }, { category: 'Bank Accounts', type: 'accounts' }];
  const result = renameAccountGroup(accounts, [], 'Travel', 'Personal');
  assert.equal(result.categories[0].baseType, 'credit');
  assert.equal(result.categories[0].name, 'Personal');
  assert.throws(() => renameAccountGroup(accounts, [], 'Travel', 'Bank Accounts'), /already exists/);
  assert.throws(() => renameAccountGroup(accounts, [], 'Travel', '  '), /required/);
});

test('credit selection does not inherit an incorrectly grouped bank account', () => {
  const accounts = [{ type: 'credit', category: 'Bank Accounts' }];
  const categories = [{ name: 'Bank Accounts', baseType: 'accounts' }, { name: 'Credit Cards', baseType: 'credit' }];
  assert.deepEqual(options('credit', accounts, categories), ['Credit Cards']);
  assert.deepEqual(options('credit', accounts, []), ['Credit Cards']);
});

test('configured group types override historical account types, including custom names', () => {
  assert.deepEqual(options('credit', [{ type: 'credit', category: 'Household' }], [
    { name: 'Household', baseType: 'accounts' }, { name: 'Travel Cards', baseType: 'credit' },
  ]), ['Travel Cards']);
});

test('custom groups remain selectable and deleted groups are excluded', () => {
  assert.deepEqual(options('credit', [{ type: 'credit', category: 'Travel' }, { type: 'credit', category: 'Old Cards' }], [
    { name: 'Credit Cards', baseType: 'credit' }, { name: 'Old Cards', baseType: 'credit', isDeletedSource: true },
  ]), ['Credit Cards', 'Travel']);
  for (const [type, name] of Object.entries({ accounts: 'Main Accounts', cash: 'Cash Accounts', credit: 'Credit Cards', loan: 'Loan Accounts' })) {
    assert.deepEqual(options(type, [], []), [name]);
  }
});
