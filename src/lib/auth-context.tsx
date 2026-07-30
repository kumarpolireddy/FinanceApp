'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase, isMockAuth } from './supabase';
import type { User, Session, AuthChangeEvent } from '@supabase/supabase-js';
import { useRouter, usePathname } from 'next/navigation';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isMockMode: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const cleanPath = (p: string | null) => {
  if (!p) return '';
  let cleaned = p.replace(/\.html$/, '').replace(/\/index$/, '');
  if (cleaned === '') cleaned = '/';
  return cleaned;
};

const getRedirectTarget = (targetPath: string) => {
  if (typeof window !== 'undefined') {
    const hasHtml = window.location.pathname.endsWith('.html');
    if (hasHtml) {
      return targetPath === '/' ? '/index.html' : `${targetPath}.html`;
    }
  }
  return targetPath;
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let mounted = true;

    // Get current session
    supabase.auth
      .getSession()
      .then(({ data: { session } }: { data: { session: Session | null } }) => {
        if (mounted) {
          setUser(session?.user ?? null);
          setLoading(false);
        }
      })
      .catch((err: any) => {
        console.error('Error fetching session:', err);
        if (mounted) {
          setUser(null);
          setLoading(false);
        }
      });

    const authState = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      if (mounted) {
        setUser(session?.user ?? null);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      const sub = authState?.data?.subscription || authState?.subscription || authState;
      if (sub && typeof sub.unsubscribe === 'function') {
        sub.unsubscribe();
      }
    };
  }, []);

  // Handle redirects
  useEffect(() => {
    if (loading) return;

    const currentPath = cleanPath(pathname);

    if (user) {
      if (currentPath === '/login') {
        router.push('/');
      }
    } else {
      if (currentPath !== '/login') {
        router.push('/login');
      }
    }
  }, [user, loading, pathname, router]);

  const signOut = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    setUser(null);
    setLoading(false);
    router.push('/login');
  };

  const currentPath = cleanPath(pathname);

  return (
    <AuthContext.Provider value={{ user, loading, isMockMode: isMockAuth, signOut }}>
      {loading || (currentPath === '/login' && user) || (currentPath !== '/login' && !user) ? (
        <div className="flex flex-col items-center justify-center min-h-screen bg-[#0a0f1e] text-slate-200">
          <div className="flex flex-col items-center gap-4">
            <div
              className="w-10 h-10 border border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin"
              style={{ borderTopColor: '#06b6d4', borderWidth: '3px' }}
            />
            <p className="text-2xs font-bold tracking-widest text-cyan-500/60 uppercase">
              WealthIQ loading
            </p>
          </div>
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
