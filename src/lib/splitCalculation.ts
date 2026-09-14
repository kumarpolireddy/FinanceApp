import type { SplitMember } from './storage';

export function calculateSplit(
  amount: string,
  method: 'equal' | 'custom',
  people: { name: string; share: string }[],
  ownShare: string
) {
  const toCents = (value: string) => {
    const number = Number(value);
    return value.trim() && Number.isFinite(number) && number >= 0 ? Math.round(number * 100) : NaN;
  };
  const total = toCents(amount);
  const names = people.map((person) => person.name.trim());
  const normalized = names.map((name) => name.toLowerCase());
  let error = '';
  if (!Number.isSafeInteger(total) || total <= 0) error = 'Enter a valid total amount.';
  else if (!people.length || names.some((name) => !name)) error = 'Enter a name for each person.';
  else if (new Set(normalized).size !== names.length || normalized.includes('you'))
    error = 'Use unique names for everyone. Your share is already listed as You.';

  const equal = Math.floor(total / (people.length + 1));
  // Assign leftover paise to your share so every split adds up exactly.
  const mine = method === 'equal' ? total - equal * people.length : toCents(ownShare);
  const shares = people.map((person) => (method === 'equal' ? equal : toCents(person.share)));
  const received = shares.reduce((sum, share) => sum + share, 0);
  if (
    !error &&
    (!Number.isSafeInteger(mine) || shares.some((share) => !Number.isSafeInteger(share)))
  )
    error = 'Enter a valid non-negative amount for every share.';
  if (!error && mine + received !== total) error = 'All shares must add up to the total amount.';

  const members: SplitMember[] = names.map((name, index) => ({
    name,
    share: shares[index] / 100,
    paid: 0,
    pending: shares[index] / 100,
  }));
  return { error, myShare: mine / 100, toReceive: received / 100, members };
}
