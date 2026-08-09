'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import AppLogo from '@/components/ui/AppLogo';
import {
  LayoutDashboard,
  Upload,
  BarChart3,
  Target,
  Wallet,
  Settings,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  FileText,
  Bell,
  HelpCircle,
  Sparkles,
  PlusCircle,
  LogOut,
  Landmark,
  Wrench,
  Plane,
  Users,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
  badgeVariant?: 'primary' | 'warning' | 'negative';
}

interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    id: 'group-main',
    label: 'OVERVIEW',
    items: [
      { id: 'nav-dashboard', label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      {
        id: 'nav-analytics',
        label: 'Analytics',
        href: '/analytics',
        icon: BarChart3,
        badge: 'New',
        badgeVariant: 'primary' as const,
      },
    ],
  },
  {
    id: 'group-data',
    label: 'DATA',
    items: [
      {
        id: 'nav-add-expense',
        label: 'Add Expense',
        href: '/add-expense',
        icon: PlusCircle,
        badge: 'Daily',
        badgeVariant: 'primary' as const,
      },
      {
        id: 'nav-import',
        label: 'Data Import',
        href: '/data-import',
        icon: Upload,
        badge: '3',
        badgeVariant: 'warning' as const,
      },
      { id: 'nav-transactions', label: 'Transactions', href: '/transactions', icon: TrendingUp },
    ],
  },
  {
    id: 'group-planning',
    label: 'PLANNING',
    items: [
      { id: 'nav-split-expenses', label: 'Split Expenses', href: '/split-expenses', icon: Users },
      { id: 'nav-trips', label: 'Trips Mode', href: '/trips', icon: Plane },
      { id: 'nav-budgets', label: 'Budgets', href: '/budgets', icon: Wallet },
      { id: 'nav-goals', label: 'Goals', href: '/goals', icon: Target },
      { id: 'nav-loans', label: 'Loans', href: '/loans', icon: Landmark },
      { id: 'nav-reports', label: 'Reports', href: '/reports', icon: FileText },
    ],
  },
  {
    id: 'group-ai',
    label: 'INTELLIGENCE',
    items: [
      {
        id: 'nav-advisor',
        label: 'AI Advisor',
        href: '/ai-advisor',
        icon: Sparkles,
        badge: 'Beta',
        badgeVariant: 'primary' as const,
      },
    ],
  },
  {
    id: 'group-tools',
    label: 'TOOLS',
    items: [
      {
        id: 'nav-tools',
        label: 'Tools',
        href: '/tools',
        icon: Wrench,
      },
    ],
  },
];

const BOTTOM_ITEMS: NavItem[] = [
  {
    id: 'nav-notifications',
    label: 'Notifications',
    href: '/notifications',
    icon: Bell,
    badge: '5',
    badgeVariant: 'negative',
  },
  { id: 'nav-help', label: 'Help & Support', href: '/help', icon: HelpCircle },
];

const badgeVariantClass: Record<string, string> = {
  primary: 'bg-primary/20 text-primary',
  warning: 'bg-warning/20 text-warning',
  negative: 'bg-negative/20 text-negative',
};

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const { user, signOut } = useAuth();

  const email = user?.email || 'arjun@wealthiq.in';
  const name = user?.email ? user.email.split('@')[0] : 'Arjun Reddy';
  const initials = name.substring(0, 2).toUpperCase();

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  const isSettingsActive = pathname.startsWith('/settings') || pathname.startsWith('/categories');

  return (
    <aside
      className={`relative flex flex-col bg-card border-r border-border flex-shrink-0 transition-all duration-200 ${
        collapsed ? 'w-16' : 'w-60'
      }`}
      style={{ minHeight: '100vh' }}
    >
      {/* Logo */}
      <div
        className={`flex items-center border-b border-border flex-shrink-0 ${
          collapsed ? 'justify-center px-0 py-4' : 'px-4 py-4 gap-2'
        }`}
        style={{ height: 64 }}
      >
        <AppLogo size={32} />
        {!collapsed && (
          <span className="font-semibold text-base tracking-tight text-foreground truncate">
            WealthIQ
          </span>
        )}
      </div>

      {/* Collapse Toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-14 z-10 w-6 h-6 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary transition-all duration-150"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>

      {/* Nav Groups */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.id}>
            {!collapsed && (
              <p className="text-2xs font-semibold tracking-widest text-muted-foreground uppercase px-2 mb-1">
                {group.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(item.href);
                const ItemIcon = item.icon;
                return (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={`group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-all duration-150 relative ${
                        active
                          ? 'nav-item-active text-primary'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                      } ${collapsed ? 'justify-center' : ''}`}
                    >
                      <ItemIcon size={16} className="flex-shrink-0" />
                      {!collapsed && (
                        <>
                          <span className="flex-1 truncate">{item.label}</span>
                          {item.badge && (
                            <span
                              className={`text-2xs font-semibold px-1.5 py-0.5 rounded-full ${badgeVariantClass[item.badgeVariant || 'primary']}`}
                            >
                              {item.badge}
                            </span>
                          )}
                        </>
                      )}
                      {collapsed && item.badge && (
                        <span
                          className={`absolute top-0.5 right-0.5 w-2 h-2 rounded-full ${
                            item.badgeVariant === 'negative'
                              ? 'bg-negative'
                              : item.badgeVariant === 'warning'
                                ? 'bg-warning'
                                : 'bg-primary'
                          }`}
                        />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Bottom Items */}
      <div className="border-t border-border px-2 py-3 space-y-0.5">
        {BOTTOM_ITEMS.map((item) => {
          const ItemIcon = item.icon;
          return (
            <Link
              key={item.id}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={`group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-150 relative ${
                collapsed ? 'justify-center' : ''
              }`}
            >
              <ItemIcon size={16} className="flex-shrink-0" />
              {!collapsed && (
                <>
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.badge && (
                    <span
                      className={`text-2xs font-semibold px-1.5 py-0.5 rounded-full ${badgeVariantClass[item.badgeVariant || 'primary']}`}
                    >
                      {item.badge}
                    </span>
                  )}
                </>
              )}
              {collapsed && item.badge && (
                <span
                  className={`absolute top-0.5 right-0.5 w-2 h-2 rounded-full ${
                    item.badgeVariant === 'negative'
                      ? 'bg-negative'
                      : item.badgeVariant === 'warning'
                        ? 'bg-warning'
                        : 'bg-primary'
                  }`}
                />
              )}
            </Link>
          );
        })}

        {/* Settings direct link (no submenu) */}
        <div>
          <Link
            href="/settings"
            title={collapsed ? 'Settings' : undefined}
            className={`w-full group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-all duration-150 relative ${
              isSettingsActive
                ? 'nav-item-active text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            } ${collapsed ? 'justify-center' : ''}`}
          >
            <Settings size={16} className="flex-shrink-0" />
            {!collapsed && <span className="flex-1 truncate text-left">Settings</span>}
          </Link>
        </div>

        {/* User Profile */}
        <div
          className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 mt-1 relative group ${
            collapsed ? 'justify-center' : ''
          }`}
        >
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-info flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-white">{initials}</span>
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate capitalize">{name}</p>
              <p className="text-2xs text-muted-foreground truncate">{email}</p>
            </div>
          )}
          {!collapsed ? (
            <button
              onClick={() => {
                if (confirm('Are you sure you want to sign out?')) {
                  signOut();
                }
              }}
              title="Sign Out"
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-negative transition flex-shrink-0"
            >
              <LogOut size={14} />
            </button>
          ) : (
            <button
              onClick={() => {
                if (confirm('Are you sure you want to sign out?')) {
                  signOut();
                }
              }}
              title="Sign Out"
              className="absolute -top-1 -right-1 p-0.5 bg-[#0f172a] rounded-full border border-border text-muted-foreground hover:text-negative opacity-0 group-hover:opacity-100 transition"
            >
              <LogOut size={10} />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
