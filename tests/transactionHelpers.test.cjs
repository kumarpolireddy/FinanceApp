const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(
  path.join(__dirname, '../src/app/transactions/transactionHelpers.ts'), 'utf8'
), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
const { matchesTransactionFilters, getChartScale, getChartPlotData } = context.exports;
const base = { typeFilter: 'all', accountFilter: 'all', destinationAccountFilter: 'all', categoryFilter: 'all', search: '' };
const transfer = { type: 'transfer', account: 'bank', toAccount: 'cash', category: 'Transfer', description: 'Withdrawal', notes: 'Weekend' };
const expense = { type: 'expense', account: 'bank', category: 'Food', description: 'Lunch' };
const accountName = (id) => id === 'bank' ? 'Main Bank' : 'Pocket Cash';
const matches = (transaction, filters) => matchesTransactionFilters(transaction, { ...base, ...filters }, accountName);

test('cash flow filters respect transfer direction', () => {
  assert.equal(matches(transfer, { typeFilter: 'cash-in', accountFilter: 'cash' }), true);
  assert.equal(matches(transfer, { typeFilter: 'cash-in', accountFilter: 'bank' }), false);
  assert.equal(matches(transfer, { typeFilter: 'cash-out', accountFilter: 'bank' }), true);
  assert.equal(matches(transfer, { typeFilter: 'cash-out', accountFilter: 'cash' }), false);
  assert.equal(matches(expense, { typeFilter: 'cash-in' }), false);
  assert.equal(matches(expense, { typeFilter: 'cash-out', accountFilter: 'bank' }), true);
});

test('transfer source and destination combine and bypass category filtering', () => {
  assert.equal(matches(transfer, { typeFilter: 'transfer', accountFilter: 'bank', destinationAccountFilter: 'cash', categoryFilter: 'Food' }), true);
  assert.equal(matches(transfer, { typeFilter: 'transfer', destinationAccountFilter: 'bank' }), false);
  assert.equal(matches(transfer, { accountFilter: 'cash' }), true);
  assert.equal(matches(expense, { categoryFilter: 'Travel' }), false);
});

test('search matches descriptions, notes, categories and either account', () => {
  for (const search of ['WITHDRAW', 'weekend', 'transfer', 'Main', 'Pocket', '   ']) {
    assert.equal(matches(transfer, { search }), true);
  }
  assert.equal(matches(expense, { search: 'lunch' }), true);
  assert.equal(matches(expense, { search: 'missing' }), false);
});

test('chart scaling preserves labels and raw values without mutating data', () => {
  const data = [{ day: 1, income: 1, expense: 100, transfer: 0 }];
  assert.equal(getChartScale([]).logarithmic, false);
  assert.equal(getChartScale([{ income: 1, expense: 99, transfer: 0 }]).logarithmic, false);
  assert.equal(getChartScale(data).logarithmic, true);
  assert.equal(getChartPlotData(data, false), data);
  const plotted = getChartPlotData(data, true)[0];
  assert.equal(plotted.day, 1);
  assert.equal(plotted.incomeRaw, 1);
  assert.equal(plotted.expenseRaw, 100);
  assert.equal(plotted.expense, Math.log10(101));
  assert.equal(plotted.transfer, 0);
  assert.equal(data[0].expense, 100);
});
