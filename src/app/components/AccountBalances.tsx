'use client';

import React from 'react';
import dynamic from 'next/dynamic';

const AccountBalancesInner = dynamic(() => import('./AccountBalancesInner'), {
  ssr: false,
  loading: () => <div className="skeleton-pulse rounded-xl h-[340px] w-full" />,
});

interface AccountBalancesProps {
  selectedMonth: number;
  selectedYear: number;
  selectedAccountId?: string;
  setSelectedAccountId?: (id: string) => void;
}

export default function AccountBalances(props: AccountBalancesProps) {
  return <AccountBalancesInner {...props} />;
}
