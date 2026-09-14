import type { Transaction } from '@/lib/storage';

/** Center the split label against the full row, independent of the amount's width. */
export default function SplitTransactionLabel({ transaction }: { transaction: Transaction }) {
  if (!transaction.isSplit) return null;
  return (
    <div className="pointer-events-none absolute inset-y-0 left-1/3 flex w-1/3 items-center justify-center px-2 text-center">
      <span className="text-xs font-semibold text-primary">
        Split
      </span>
    </div>
  );
}
