'use client';

import React, { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import PCManagerComponent from '@/components/PCManager';
import { 
  Settings, 
  Wrench, 
  Wallet, 
  PieChart, 
  TrendingUp, 
  Briefcase, 
  FileText, 
  UploadCloud, 
  HelpCircle, 
  Download, 
  Globe,
  Database,
  ArrowLeft,
  Plane,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

export default function MorePage() {
  const router = useRouter();
  const [subView, setSubView] = useState<'menu' | 'pc' | 'backup' | 'help'>('menu');

  const MENU_ITEMS = [
    { label: 'Trips', icon: Plane, color: 'text-primary', path: '/trips' },
    { label: 'Analytics', icon: PieChart, color: 'text-primary', path: '/analytics' },
    { label: 'Budgets', icon: Briefcase, color: 'text-primary', path: '/budgets' },
    { label: 'Loans & Debts', icon: Wallet, color: 'text-primary', path: '/loans' },
    { label: 'Goals', icon: TrendingUp, color: 'text-primary', path: '/goals' },
    { label: 'Reports', icon: FileText, color: 'text-primary', path: '/reports' },
    { label: 'Tools', icon: Wrench, color: 'text-primary', path: '/tools' },
    { label: 'Settings', icon: Settings, color: 'text-primary', path: '/settings' },
    { label: 'Import Excel', icon: UploadCloud, color: 'text-primary', path: '/data-import' },
    { label: 'PC Sync', icon: Globe, color: 'text-primary', action: () => setSubView('pc') },
    { label: 'Backup DB', icon: Database, color: 'text-primary', action: () => setSubView('backup') },
    { label: 'Help Guide', icon: HelpCircle, color: 'text-primary', action: () => setSubView('help') },
  ];

  return (
    <AppLayout>
      <div className="max-w-md mx-auto px-0 md:px-4 py-3 space-y-4 bg-background">
        
        {subView !== 'menu' && (
          <div className="px-4 md:px-0">
            <button 
              onClick={() => setSubView('menu')}
              className="flex items-center gap-1.5 text-primary text-xs font-bold hover:opacity-80 transition"
            >
              <ArrowLeft size={16} />
              Back to Options Grid
            </button>
          </div>
        )}

        {/* 1. Icon-based Navigation Grid */}
        {subView === 'menu' && (
          <div className="space-y-4">
            
            <div className="grid grid-cols-3 gap-2.5">
              {MENU_ITEMS.map((item, idx) => {
                const Icon = item.icon;
                return (
                  <button
                    key={`grid-item-${idx}`}
                    onClick={() => {
                      if (item.path) {
                        router.push(item.path);
                      } else if (item.action) {
                        item.action();
                      }
                    }}
                    className="bg-secondary border border-border/60 hover:border-primary/40 rounded-lg p-3.5 flex flex-col items-center justify-center gap-2 transition active:scale-95 text-center cursor-pointer shadow-xs"
                  >
                    <div className="w-10 h-10 bg-background/50 rounded-full flex items-center justify-center border border-border/40 shrink-0">
                      <Icon size={18} className={item.color} />
                    </div>
                    <span className="text-[10px] font-bold text-foreground leading-tight">{item.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Version Display */}
            <div className="bg-secondary/40 border border-border/50 rounded-lg p-3 text-center space-y-0.5 text-2xs">
              <span className="font-extrabold text-foreground block">WealthIQ Pro v1.2.0</span>
              <p className="text-[10px] text-muted-foreground font-semibold">Ledger-focused local-first database client.</p>
            </div>

          </div>
        )}

        {/* 2. Sub-view: PC Manager Server */}
        {subView === 'pc' && (
          <div className="animate-slide-up">
            <PCManagerComponent />
          </div>
        )}

        {/* 3. Sub-view: JSON Backup & Restore */}
        {subView === 'backup' && (
          <div className="bg-secondary border border-border rounded-lg p-5 space-y-4 shadow-md text-center animate-slide-up text-2xs">
            <h2 className="text-xs font-black uppercase text-foreground">Database Backup & Restore</h2>
            <p className="text-muted-foreground leading-relaxed font-semibold text-[10px]">
              Export a complete backup of all transaction history, accounts, categories, and goals. Import it on any device to restore your database.
            </p>
            
            <div className="space-y-2 pt-2">
              {/* Export */}
              <button
                onClick={() => {
                  const backup: Record<string, string | null> = {};
                  for(let i=0; i<localStorage.length; i++){
                    const k = localStorage.key(i);
                    if(k && k.startsWith('wealthiq_')){
                      backup[k] = localStorage.getItem(k);
                    }
                  }
                  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `wealthiq-backup-${new Date().toISOString().slice(0, 10)}.json`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                  toast.success('Backup file downloaded');
                }}
                className="w-full py-2 bg-primary text-primary-foreground font-bold rounded hover:opacity-90 transition flex items-center justify-center gap-1.5 cursor-pointer uppercase tracking-wider text-[10px]"
              >
                <Download size={13} />
                Export Backup File (.json)
              </button>
              
              {/* Import */}
              <label className="w-full py-2 bg-background border border-border font-bold rounded hover:bg-muted/30 transition flex items-center justify-center gap-1.5 cursor-pointer block uppercase tracking-wider text-[10px]">
                <UploadCloud size={13} className="text-primary" />
                Import Backup File
                <input 
                  type="file" 
                  accept=".json" 
                  className="hidden" 
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (evt) => {
                      try {
                        const data = JSON.parse(evt.target?.result as string);
                        Object.entries(data).forEach(([k, v]) => {
                          if (k.startsWith('wealthiq_') && typeof v === 'string') {
                            localStorage.setItem(k, v);
                          }
                        });
                        toast.success('Database restored! Reloading...');
                        setTimeout(() => window.location.reload(), 800);
                      } catch (err) {
                        toast.error('Invalid backup JSON format');
                      }
                    };
                    reader.readAsText(file);
                  }}
                />
              </label>
            </div>
          </div>
        )}

        {/* 4. Sub-view: Help Guide & FAQ */}
        {subView === 'help' && (
          <div className="bg-secondary border border-border rounded-lg p-4 space-y-4 shadow-md text-2xs text-muted-foreground animate-slide-up leading-relaxed">
            <h2 className="text-xs font-black uppercase text-foreground text-center mb-1">Help & FAQ</h2>
            
            <div className="space-y-1">
              <p className="font-bold text-foreground">How do I add a new transaction?</p>
              <p>Go to the Transactions tab or the dashboard, and click the floating "+" icon. Choose Type, amount, account, and category, then tap save.</p>
            </div>
            
            <div className="space-y-1">
              <p className="font-bold text-foreground">How do I configure bank accounts or loans?</p>
              <p>Go to the Settings grid item, where you can customize Bank Accounts, Cash balances, Credit Cards, and active Loans.</p>
            </div>

            <div className="space-y-1">
              <p className="font-bold text-foreground">How does PC sync work?</p>
              <p>Open PC Sync from the grid, ensure your computer and phone are on the same Wi-Fi network, and browse the address displayed on your phone.</p>
            </div>
          </div>
        )}

      </div>
    </AppLayout>
  );
}
