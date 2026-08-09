'use client';

import React, { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Sidebar from './Sidebar';
import { 
  BarChart3, 
  List, 
  Wallet, 
  Menu, 
  ChevronLeft,
  LayoutDashboard,
  Plus
} from 'lucide-react';

interface AppLayoutProps {
  children: React.ReactNode;
}

const TABS = [
  { id: 'transactions', label: 'Transactions', path: '/transactions', icon: List },
  { id: 'statistics', label: 'Statistics', path: '/analytics', icon: BarChart3 },
  { id: 'accounts', label: 'Accounts', path: '/accounts', icon: Wallet },
  { id: 'more', label: 'More', path: '/more', icon: Menu }
];

export default function AppLayout({ children }: AppLayoutProps) {
  const pathname = usePathname() || '';
  const router = useRouter();
  
  const [isMobile, setIsMobile] = useState(false);
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);

  const handleSwipeBack = () => {
    const params = new URLSearchParams(window.location.search);
    const accountParam = params.get('account');
    const categoryParam = params.get('category');

    if (pathname === '/transactions') {
      if (accountParam) {
        router.push('/accounts');
        return;
      }
      if (categoryParam) {
        router.push('/analytics');
        return;
      }
    }

    if (pathname === '/add-expense') {
      router.push('/transactions');
      return;
    }

    router.back();
  };

  const handleGlobalTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    const rect = e.currentTarget.getBoundingClientRect();
    const relativeX = touch.clientX - rect.left;
    
    // Swipe back should start near the left edge for natural feel and compatibility with internal horizontal sliders
    if (relativeX < 80) {
      setTouchStart({ x: touch.clientX, y: touch.clientY });
    } else {
      setTouchStart(null);
    }
  };

  const handleGlobalTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart) return;
    const touch = e.changedTouches[0];
    const diffX = touch.clientX - touchStart.x;
    const diffY = touch.clientY - touchStart.y;
    
    const minSwipeDistance = 60;
    if (diffX > minSwipeDistance && Math.abs(diffX) > Math.abs(diffY)) {
      handleSwipeBack();
    }
    setTouchStart(null);
  };

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const isCapacitor = typeof window !== 'undefined' && (window as any).Capacitor;
    if (!isCapacitor) return;

    let handler: any;
    const init = async () => {
      const { App } = await import('@capacitor/app');
      handler = await App.addListener('backButton', () => {
        const params = new URLSearchParams(window.location.search);
        const accountParam = params.get('account');
        const categoryParam = params.get('category');

        if (pathname === '/transactions') {
          if (accountParam) {
            router.push('/accounts');
            return;
          }
          if (categoryParam) {
            router.push('/analytics');
            return;
          }
        }

        if (pathname === '/add-expense') {
          router.push('/transactions');
          return;
        }

        if (pathname !== '/' && pathname !== '/dashboard') {
          router.back();
        } else {
          router.back();
        }
      });
    };
    init();

    return () => {
      if (handler) {
        handler.remove();
      }
    };
  }, [pathname, router]);

  // Determine active tab
  const activeTab = (() => {
    if (pathname.startsWith('/transactions')) return 'transactions';
    if (pathname.startsWith('/analytics')) return 'statistics';
    if (pathname.startsWith('/accounts') || pathname.startsWith('/loans')) return 'accounts';
    if (pathname.startsWith('/more')) return 'more';
    return '';
  })();

  // Page title calculation based on route
  const pageTitle = (() => {
    if (pathname === '/' || pathname.startsWith('/dashboard')) return 'Dashboard';
    if (pathname.startsWith('/transactions')) return 'Transactions';
    if (pathname.startsWith('/analytics')) return 'Statistics';
    if (pathname.startsWith('/accounts')) return 'Accounts';
    if (pathname.startsWith('/budgets')) return 'Budgets';
    if (pathname.startsWith('/loans')) return 'Loans & Debts';
    if (pathname.startsWith('/goals')) return 'Goals';
    if (pathname.startsWith('/reports')) return 'Reports';
    if (pathname.startsWith('/tools')) return 'Financial Tools';
    if (pathname.startsWith('/settings')) return 'Settings';
    if (pathname.startsWith('/data-import')) return 'Data Import';
    if (pathname.startsWith('/split-expenses')) return 'Split Expenses';
    if (pathname.startsWith('/more')) return 'More Options';
    return 'WealthIQ';
  })();

  const isMainTab = pathname === '/dashboard' || pathname === '/transactions' || pathname === '/analytics' || pathname === '/accounts' || pathname === '/more';
  const showFAB = pathname === '/dashboard' || pathname === '/transactions';

  if (isMobile) {
    return (
      <div 
        onTouchStart={handleGlobalTouchStart}
        onTouchEnd={handleGlobalTouchEnd}
        className="flex flex-col h-[100dvh] min-h-[100dvh] max-w-md mx-auto bg-background text-foreground overflow-hidden font-sans border-x border-border/40 relative select-none"
      >
        
        {/* Mobile Header */}
        <header className="fixed top-0 left-0 right-0 w-full max-w-md mx-auto h-14 bg-secondary/95 backdrop-blur-md border-b border-border flex items-center justify-between px-4 z-50">
          <div className="flex items-center gap-2">
            {!isMainTab && pathname !== '/' ? (
              <button 
                onClick={() => router.back()}
                className="p-1 rounded-lg hover:bg-muted/50 transition flex items-center gap-0.5 text-primary text-xs font-black uppercase"
              >
                <ChevronLeft size={16} />
                <span>Back</span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="text-sm">📊</span>
                <span className="font-extrabold tracking-tighter text-foreground text-xs uppercase">WealthIQ</span>
              </div>
            )}
          </div>
          
          <h2 className="text-xs font-bold uppercase tracking-wider text-foreground text-center truncate px-2">
            {pageTitle}
          </h2>

          <div className="flex items-center gap-2">
            {pathname !== '/dashboard' && (
              <button 
                onClick={() => router.push('/dashboard')}
                className="p-1.5 rounded-lg border border-border/80 hover:bg-muted/50 transition text-muted-foreground hover:text-foreground"
                title="Dashboard"
              >
                <LayoutDashboard size={14} />
              </button>
            )}
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto pt-14 pb-20 select-text bg-background">
          <div className="animate-fade-in pb-4">
            {children}
          </div>
        </main>

        {/* Floating Add Button */}
        {showFAB && (
          <button
            onClick={() => router.push('/add-expense')}
            className="fixed bottom-20 right-6 w-12 h-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95 z-40 cursor-pointer hover:opacity-90"
            aria-label="Add transaction"
          >
            <Plus size={24} />
          </button>
        )}

        {/* Mobile Bottom Tab Bar */}
        {!pathname.startsWith('/add-expense') && (
          <nav className="fixed bottom-0 left-0 right-0 w-full max-w-md mx-auto h-16 bg-secondary/95 backdrop-blur-md border-t border-border flex justify-around items-center z-50 pb-safe">
            {TABS.map((tab) => {
              const IconComponent = tab.icon;
              const isActive = activeTab === tab.id;
              
              return (
                <button
                  key={tab.id}
                  onClick={() => router.push(tab.path)}
                  className={`flex-1 h-full flex flex-col justify-center items-center gap-1 transition-all ${
                    isActive ? 'text-primary font-bold' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <IconComponent size={18} className={isActive ? 'stroke-[2.5px]' : 'stroke-[1.8px]'} />
                  <span className="text-[10px] font-bold uppercase tracking-wider">{tab.label}</span>
                </button>
              );
            })}
          </nav>
        )}

      </div>
    );
  }

  // Desktop / Tablet layout (Standard SideBar)
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-auto relative">
        {children}
        {showFAB && (
          <button
            onClick={() => router.push('/add-expense')}
            className="fixed bottom-8 right-8 w-14 h-14 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-xl transition-all active:scale-95 hover:scale-105 z-40 cursor-pointer"
            aria-label="Add transaction"
          >
            <Plus size={28} />
          </button>
        )}
      </main>
    </div>
  );
}
