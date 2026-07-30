import { createClient, type User, type Session, type AuthChangeEvent } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Detect if we are using the default placeholder/dummy configuration
export const isMockAuth =
  !supabaseUrl ||
  !supabaseAnonKey ||
  supabaseUrl.includes('dummy') ||
  supabaseAnonKey.includes('dummykey');

// TypeScript types for the mock auth layer
type AuthListener = (event: AuthChangeEvent, session: Session | null) => void;

class MockAuthService {
  private listeners: Set<AuthListener> = new Set();

  constructor() {
    // Listen to storage changes to keep tabs synchronized
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key === 'wealthiq_mock_session') {
          this.trigger('SIGNED_IN', this.getMockSession());
        }
      });
    }
  }

  private getMockUsers(): Record<string, string> {
    if (typeof window === 'undefined') return {};
    try {
      return JSON.parse(localStorage.getItem('wealthiq_mock_users') || '{}');
    } catch {
      return {};
    }
  }

  private saveMockUser(email: string, passwordHash: string) {
    if (typeof window === 'undefined') return;
    const users = this.getMockUsers();
    users[email.toLowerCase()] = passwordHash;
    localStorage.setItem('wealthiq_mock_users', JSON.stringify(users));
  }

  private getMockSession(): Session | null {
    if (typeof window === 'undefined') return null;
    try {
      const sessionStr = localStorage.getItem('wealthiq_mock_session');
      return sessionStr ? JSON.parse(sessionStr) : null;
    } catch {
      return null;
    }
  }

  private trigger(event: AuthChangeEvent, session: Session | null) {
    this.listeners.forEach((listener) => {
      try {
        listener(event, session);
      } catch (err) {
        console.error('Error in auth listener:', err);
      }
    });
  }

  async signUp({ email, password }: { email: string; password?: string }) {
    if (!email || !password) {
      return { data: { user: null }, error: new Error('Email and password are required.') };
    }

    // Simulate short network latency
    await new Promise((resolve) => setTimeout(resolve, 600));

    const users = this.getMockUsers();
    if (users[email.toLowerCase()]) {
      return { data: { user: null }, error: new Error('User already exists.') };
    }

    // In a real app we hash passwords; here we just store a mock hash (plain text/simple encoding)
    this.saveMockUser(email, password);

    const user: User = {
      id: `mock-usr-${Math.random().toString(36).substr(2, 9)}`,
      email: email,
      created_at: new Date().toISOString(),
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      role: 'authenticated',
    };

    // Auto log in on sign up
    const session: Session = {
      access_token: `mock-jwt-${Math.random().toString(36).substr(2, 15)}`,
      token_type: 'bearer',
      expires_in: 3600,
      refresh_token: `mock-refresh-${Math.random().toString(36).substr(2, 15)}`,
      user: user,
    };

    localStorage.setItem('wealthiq_mock_session', JSON.stringify(session));
    this.trigger('SIGNED_IN', session);

    return { data: { user, session }, error: null };
  }

  async signInWithPassword({ email, password }: { email: string; password?: string }) {
    if (!email || !password) {
      return {
        data: { session: null, user: null },
        error: new Error('Email and password are required.'),
      };
    }

    // Simulate short network latency
    await new Promise((resolve) => setTimeout(resolve, 600));

    const users = this.getMockUsers();
    const storedPassword = users[email.toLowerCase()];

    // For developer convenience, if mock users list is empty, let them log in with any password
    const isFirstRun = Object.keys(users).length === 0;

    if (!isFirstRun && storedPassword !== password) {
      return {
        data: { session: null, user: null },
        error: new Error('Invalid login credentials.'),
      };
    }

    if (isFirstRun) {
      // Auto register them
      this.saveMockUser(email, password);
    }

    const user: User = {
      id: `mock-usr-${Math.random().toString(36).substr(2, 9)}`,
      email: email,
      created_at: new Date().toISOString(),
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      role: 'authenticated',
    };

    const session: Session = {
      access_token: `mock-jwt-${Math.random().toString(36).substr(2, 15)}`,
      token_type: 'bearer',
      expires_in: 3600,
      refresh_token: `mock-refresh-${Math.random().toString(36).substr(2, 15)}`,
      user: user,
    };

    localStorage.setItem('wealthiq_mock_session', JSON.stringify(session));
    this.trigger('SIGNED_IN', session);

    return { data: { session, user }, error: null };
  }

  async signOut() {
    await new Promise((resolve) => setTimeout(resolve, 300));
    localStorage.removeItem('wealthiq_mock_session');
    this.trigger('SIGNED_OUT', null);
    return { error: null };
  }

  async getSession() {
    return { data: { session: this.getMockSession() }, error: null };
  }

  async getUser() {
    const session = this.getMockSession();
    return { data: { user: session ? session.user : null }, error: null };
  }

  onAuthStateChange(callback: AuthListener) {
    this.listeners.add(callback);

    // Immediately fire with current state
    const currentSession = this.getMockSession();
    callback(currentSession ? 'SIGNED_IN' : 'INITIAL_SESSION', currentSession);

    return {
      data: {
        subscription: {
          unsubscribe: () => {
            this.listeners.delete(callback);
          },
        },
      },
    };
  }
}

// Instantiate either real Supabase or the Mock Service
const mockAuth = new MockAuthService();

let supabaseInstance: any = null;
try {
  supabaseInstance = isMockAuth
    ? ({
        auth: mockAuth,
      } as any)
    : createClient(supabaseUrl, supabaseAnonKey);
} catch (e) {
  console.error("Failed to initialize Supabase client, falling back to mock auth:", e);
  supabaseInstance = {
    auth: mockAuth,
  } as any;
}

export const supabase = supabaseInstance;
