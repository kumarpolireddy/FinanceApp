'use client';

import React, { useState } from 'react';
import { supabase, isMockAuth } from '@/lib/supabase';
import AppLogo from '@/components/ui/AppLogo';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Lock, Mail, AlertTriangle, UserPlus, LogIn } from 'lucide-react';

export default function LoginPage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  const validateForm = () => {
    if (!email.trim() || !email.includes('@')) {
      toast.error('Please enter a valid email address.');
      return false;
    }
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters.');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setSubmitting(true);
    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password: password,
        });

        if (error) {
          toast.error(error.message || 'Registration failed.');
        } else {
          toast.success(
            isMockAuth
              ? 'Successfully registered and logged in!'
              : 'Registration successful! Check your email for verification.'
          );
          if (data?.session) {
            router.push('/');
          } else {
            setIsSignUp(false); // Switch to login tab
          }
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password,
        });

        if (error) {
          toast.error(error.message || 'Login failed. Please check credentials.');
        } else {
          toast.success('Successfully logged in!');
          router.push('/');
        }
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      toast.error('An unexpected error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-background items-center justify-center p-4 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md space-y-6 z-10">
        {/* Logo and Header */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="p-4 bg-primary/10 border border-primary/30 rounded-2xl shadow-card-lg ">
            <AppLogo size={42} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground mt-4">
            Wealth<span className="text-primary">IQ</span>
          </h1>
          <p className="text-xs text-slate-400 max-w-xs">
            Advanced Personal Finance Analytics &amp; Planning
          </p>
        </div>

        {/* Auth Box */}
        <div className="bg-card/70 backdrop-blur-xl border border-border/80 rounded-2xl p-6 shadow-card-lg space-y-6">
          {/* Mock Banner */}
          {isMockAuth && (
            <div className="flex gap-2.5 items-start bg-primary/10 border border-primary/20 rounded-xl p-4 text-primary text-2xs leading-normal">
              <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-bold uppercase tracking-wider block mb-0.5">
                  Development Mode
                </span>
                Using dummy Supabase credentials. Any email/password will register and log you in.
              </div>
            </div>
          )}

          {/* Form Header / Mode switch tabs */}
          <div className="flex border-b border-border/50 pb-0.5">
            <button
              onClick={() => {
                setIsSignUp(false);
                setEmail('');
                setPassword('');
              }}
              className={`flex-1 pb-3 text-sm font-semibold transition-all relative ${
                !isSignUp ? 'text-foreground' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Sign In
              {!isSignUp && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
              )}
            </button>
            <button
              onClick={() => {
                setIsSignUp(true);
                setEmail('');
                setPassword('');
              }}
              className={`flex-1 pb-3 text-sm font-semibold transition-all relative ${
                isSignUp ? 'text-foreground' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Register
              {isSignUp && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
              )}
            </button>
          </div>

          {/* Input fields form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-3xs font-semibold text-slate-400 uppercase tracking-widest mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                  <Mail size={15} />
                </span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={submitting}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-border bg-background/80 text-sm text-slate-200 focus:outline-none focus:border-primary transition-all font-medium"
                />
              </div>
            </div>

            <div>
              <label className="block text-3xs font-semibold text-slate-400 uppercase tracking-widest mb-1.5 flex justify-between items-center">
                Password
                {!isSignUp && (
                  <span className="text-4xs text-primary hover:underline cursor-pointer normal-case font-semibold">
                    Forgot Password?
                  </span>
                )}
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                  <Lock size={15} />
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting}
                  className="w-full pl-10 pr-10 py-3 rounded-xl border border-border bg-background/80 text-sm text-slate-200 focus:outline-none focus:border-primary transition-all font-medium"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-300"
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 font-semibold text-sm flex items-center justify-center gap-1.5 transition-all shadow-lg shadow-primary/10 active:scale-[0.98] disabled:opacity-50 disabled:scale-100"
            >
              {submitting ? (
                <div className="w-5 h-5 border-2 border-primary-foreground/20 border-t-primary-foreground rounded-full animate-spin" />
              ) : (
                <>
                  {isSignUp ? (
                    <>
                      Create Account
                      <UserPlus size={16} />
                    </>
                  ) : (
                    <>
                      Sign In
                      <LogIn size={16} />
                    </>
                  )}
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-4xs text-center text-slate-600">
          By continuing, you agree to {"WealthIQ's"} Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
