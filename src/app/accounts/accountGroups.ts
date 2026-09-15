import type { Account, AccountCategory } from '@/lib/storage';

const defaults: Record<Account['type'], string> = {
  accounts: 'Main Accounts', cash: 'Cash Accounts', credit: 'Credit Cards', loan: 'Loan Accounts',
};

export const accountGroupKey = (name: string) => name.toLowerCase().trim().replace(/[^a-z0-9]/g, '_');

export function renameAccountGroup(accounts: Account[], categories: AccountCategory[], oldName: string, newName: string) {
  const name = newName.trim();
  const oldKey = accountGroupKey(oldName);
  const newKey = accountGroupKey(name);
  if (!name) throw new Error('Group name is required');
  if ([...accounts.map((account) => account.category || 'Unassigned'), ...categories.map((category) => category.name)]
    .some((existing) => accountGroupKey(existing) !== oldKey && accountGroupKey(existing) === newKey)) {
    throw new Error('An account group with this name already exists');
  }
  const members = accounts.filter((account) => accountGroupKey(account.category || 'Unassigned') === oldKey);
  const hasDefinition = categories.some((category) => accountGroupKey(category.name) === oldKey);
  return {
    accounts: accounts.map((account) => members.includes(account) ? { ...account, category: name } : account),
    categories: hasDefinition
      ? categories.map((category) => accountGroupKey(category.name) === oldKey ? { ...category, name } : category)
      : [...categories, { id: `account-group-${newKey}`, name, baseType: members[0]?.type || 'accounts' } as AccountCategory],
  };
}

export function getAccountGroupOptions(type: Account['type'], accounts: Account[], categories: AccountCategory[]): string[] {
  const normalize = (name: string) => name.trim().toLowerCase();
  const configured = categories.filter((category) => !category.isDeletedSource);
  const names = configured.filter((category) => category.baseType === type).map((category) => category.name);
  for (const account of accounts) {
    const name = account.category?.trim();
    if (!name || account.isDeletedSource || account.type !== type) continue;
    const definition = categories.find((category) => normalize(category.name) === normalize(name));
    if (definition) continue; // The group's definition takes priority over an account's type.
    const inferredType = /credit|card/i.test(name) ? 'credit'
      : /cash|wallet/i.test(name) ? 'cash'
      : /loan|borrow|lend|debt|liability/i.test(name) ? 'loan'
      : /bank|main accounts/i.test(name) ? 'accounts' : undefined;
    if (inferredType && inferredType !== type) continue;
    if (normalize(name) === 'unassigned') continue;
    if (!names.some((existing) => normalize(existing) === normalize(name))) names.push(name);
  }
  return names.length ? names : [defaults[type]];
}
