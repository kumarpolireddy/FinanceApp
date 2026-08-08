'use client';

import React, { createContext, useContext } from 'react';

interface AuthContextType {
  user: { email: string } | null;
  loading: boolean;
  isMockMode: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Auth is bypassed — always treat the user as a local guest.
// Login page will be added back once all features are complete.
const GUEST_USER = { email: 'guest@wealthiq.app' };

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const signOut = async () => {
    // No-op: login will be added later
  };

  return (
    <AuthContext.Provider
      value={{
        user: GUEST_USER,
        loading: false,
        isMockMode: true,
        signOut,
      }}
    >
      {children}
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
