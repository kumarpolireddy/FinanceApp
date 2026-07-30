import React from 'react';
import { BarChart3, Download, Share2 } from 'lucide-react';

export default function AnalyticsHeader() {
  return (
    <div className="flex items-start justify-between">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
          <BarChart3 size={18} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Spending Intelligence</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Deep analytics across 3,824 transactions · Jan 2023 – Jun 2026
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all duration-150">
          <Share2 size={12} />
          Share
        </button>
        <button className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all duration-150">
          <Download size={12} />
          Export PDF
        </button>
      </div>
    </div>
  );
}
