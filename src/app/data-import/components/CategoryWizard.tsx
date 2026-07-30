'use client';

import React, { useState } from 'react';
import { ChevronDown, Plus, Check, ArrowRight, X } from 'lucide-react';

export interface CategoryMap {
  id: string;
  sourceCategory: string;
  transactionCount: number;
  selectedTarget: string;
  confidence?: number;
}

interface CategoryWizardProps {
  mappings: CategoryMap[];
  onMappingChange: (sourceCategory: string, selectedTarget: string) => void;
  userCategories: string[];
  onAddCustomCategory: (newCatName: string) => void;
}

export default function CategoryWizard({
  mappings,
  onMappingChange,
  userCategories,
  onAddCustomCategory,
}: CategoryWizardProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newCategoryName.trim();
    if (!clean) return;
    onAddCustomCategory(clean);
    setNewCategoryName('');
    setShowAddForm(false);
  };

  const allMapped = mappings.every((m) => m.selectedTarget !== '');
  const highConfidence = mappings.filter((m) => (m.confidence || 0) >= 85).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl bg-muted/20 border border-border gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="text-muted-foreground">
            {mappings.length} source categories detected
          </span>
          <span className="w-1.5 h-1.5 rounded-full bg-border hidden sm:inline" />
          <span className="text-positive">{highConfidence} auto-matched with high confidence</span>
          <span className="w-1.5 h-1.5 rounded-full bg-border hidden sm:inline" />
          <span className="text-foreground font-medium">
            {mappings.reduce((s, m) => s + m.transactionCount, 0).toLocaleString('en-IN')} total
            transactions
          </span>
        </div>
        {!showAddForm ? (
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors duration-150 font-semibold self-end sm:self-auto"
          >
            <Plus size={12} />
            Add custom category
          </button>
        ) : (
          <form onSubmit={handleAddSubmit} className="flex items-center gap-2 w-full sm:w-auto">
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              className="text-xs bg-[#0b0f1a] border border-border rounded-lg px-2.5 py-1.5 text-slate-200 hover:border-primary/40 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors duration-150 w-full sm:w-40"
              autoFocus
            />
            <button
              type="submit"
              className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 transition-all duration-150"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg"
            >
              <X size={14} />
            </button>
          </form>
        )}
      </div>

      <div className="border border-border rounded-xl overflow-hidden">
        <div className="grid grid-cols-12 px-4 py-2.5 bg-muted/30 border-b border-border">
          <div className="col-span-4 text-xs font-semibold tracking-wider uppercase text-muted-foreground">
            Source Category
          </div>
          <div className="col-span-2 text-xs font-semibold tracking-wider uppercase text-muted-foreground">
            Transactions
          </div>
          <div className="col-span-1 text-xs font-semibold tracking-wider uppercase text-muted-foreground text-center">
            →
          </div>
          <div className="col-span-4 text-xs font-semibold tracking-wider uppercase text-muted-foreground">
            WealthIQ Category
          </div>
          <div className="col-span-1 text-xs font-semibold tracking-wider uppercase text-muted-foreground text-center">
            Match
          </div>
        </div>

        {mappings.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground bg-muted/5">
            No categories detected in source. Proceed to preview.
          </div>
        ) : (
          mappings.map((mapping) => (
            <div
              key={mapping.id || mapping.sourceCategory}
              className="grid grid-cols-12 px-4 py-3 border-b border-border last:border-0 items-center row-hover-highlight hover:bg-muted/20"
            >
              <div className="col-span-4 pr-3">
                <p className="text-sm font-medium text-foreground">{mapping.sourceCategory}</p>
              </div>
              <div className="col-span-2">
                <span className="text-xs tabular-nums text-muted-foreground">
                  {mapping.transactionCount.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="col-span-1 flex justify-center">
                <ArrowRight size={14} className="text-muted-foreground" />
              </div>
              <div className="col-span-4 pr-3">
                <div className="relative">
                  <select
                    value={mapping.selectedTarget}
                    onChange={(e) => onMappingChange(mapping.sourceCategory, e.target.value)}
                    className="w-full text-sm bg-[#0b0f1a] border border-border rounded-lg px-3 py-1.5 text-slate-200 appearance-none cursor-pointer hover:border-primary/40 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors duration-150"
                  >
                    <option value="" className="bg-[#0b0f1a] text-slate-200">
                      — Select category —
                    </option>
                    {userCategories.map((cat) => (
                      <option
                        key={`wiq-cat-${cat}`}
                        value={cat}
                        className="bg-[#0b0f1a] text-slate-200"
                      >
                        {cat}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={12}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                  />
                </div>
              </div>
              <div className="col-span-1 flex justify-center">
                {mapping.selectedTarget ? (
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center ${
                      (mapping.confidence || 0) >= 85
                        ? 'bg-positive-subtle text-positive'
                        : 'bg-warning-subtle text-warning'
                    }`}
                  >
                    <Check size={10} />
                  </div>
                ) : (
                  <div className="w-6 h-6 rounded-full bg-muted border border-border" />
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {allMapped && mappings.length > 0 && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-positive-subtle border border-positive-subtle">
          <Check size={14} className="text-positive" />
          <p className="text-sm text-positive font-medium">
            All categories mapped — ready to import
          </p>
        </div>
      )}
    </div>
  );
}
