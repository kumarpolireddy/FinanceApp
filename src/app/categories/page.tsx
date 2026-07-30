'use client';

import React from 'react';
import AppLayout from '@/components/AppLayout';
import { CategorySettingsInner } from './components/CategorySettingsInner';

export default function CategoriesPage() {
  return (
    <AppLayout>
      <div className="px-6 py-6 xl:px-10 2xl:px-16 max-w-screen-xl mx-auto">
        <CategorySettingsInner />
      </div>
    </AppLayout>
  );
}
