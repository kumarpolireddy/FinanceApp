'use client';

import React, { useState, useEffect } from 'react';
import { Sparkles, X, Send, Bot, RefreshCw } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { toast } from 'sonner';

import FormattedChatMessage from './FormattedChatMessage';

import { getFullFinancialContext } from '@/lib/aiContext';

export default function FloatingAiAssistant() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');

  if (pathname?.startsWith('/ai-advisor')) {
    return null;
  }
  const STORAGE_KEY = 'wealthiq_ai_chat_history';

  const [messages, setMessages] = useState<Array<{ id?: string; role: 'user' | 'assistant'; content: string; timestamp?: string }>>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        } catch (e) {}
      }
    }
    return [
      {
        id: 'welcome',
        role: 'assistant',
        content: '👋 Hello! How can I assist you?',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ];
  });

  useEffect(() => {
    if (typeof window !== 'undefined' && messages.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    }
  }, [messages]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const userText = input.trim();
    setInput('');
    const newMsgs = [...messages, { role: 'user' as const, content: userText }];
    setMessages(newMsgs);
    setLoading(true);

    try {
      const context = getFullFinancialContext();
      const endpoint = typeof window !== 'undefined' && window.location.protocol.startsWith('http')
        ? '/api/ai/chat'
        : (process.env.NEXT_PUBLIC_SITE_URL && !process.env.NEXT_PUBLIC_SITE_URL.includes('builtwithrocket.new'))
          ? `${process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')}/api/ai/chat`
          : '/api/ai/chat';

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMsgs.map((m) => ({ role: m.role, content: m.content })),
          context,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to connect');

      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply || 'No response' }]);
    } catch (e: any) {
      toast.error(e.message || 'AI request failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-20 md:bottom-6 left-4 sm:left-6 z-40 w-12 h-12 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all duration-200"
        title="Gemini AI Financial Assistant"
        aria-label="Open AI Assistant"
      >
        <Sparkles size={22} className="animate-pulse" />
      </button>

      {/* Quick Drawer / Popup Modal */}
      {isOpen && (
        <div className="fixed bottom-36 md:bottom-20 left-3 sm:left-6 z-50 w-[calc(100vw-24px)] sm:w-96 h-[420px] sm:h-[440px] bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-fade-in">
          {/* Header */}
          <div className="p-3 bg-muted/60 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary/20 text-primary flex items-center justify-center">
                <Sparkles size={16} />
              </div>
              <div>
                <h4 className="text-xs font-bold text-foreground">WealthIQ AI Assistant</h4>
                <p className="text-[10px] text-muted-foreground">Powered by Gemini 2.5</p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  setIsOpen(false);
                  router.push('/ai-advisor');
                }}
                className="text-[11px] text-primary hover:underline px-2 py-0.5"
              >
                Expand Full Screen &rarr;
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-md hover:bg-muted text-muted-foreground"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {m.role === 'assistant' && (
                  <div className="w-6 h-6 rounded-md bg-purple-600 text-white flex items-center justify-center shrink-0">
                    <Bot size={12} />
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-xl px-3 py-2 leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/50 border border-border text-foreground'
                  }`}
                >
                  <FormattedChatMessage content={m.content} isUser={m.role === 'user'} />
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-muted-foreground text-xs">
                <RefreshCw size={12} className="animate-spin text-primary" />
                <span>Gemini is thinking...</span>
              </div>
            )}
          </div>

          {/* Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="p-2 border-t border-border flex items-center gap-2 bg-card"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything..."
              disabled={loading}
              className="flex-1 text-xs bg-muted/40 border border-border rounded-lg px-2.5 py-1.5 outline-none focus:border-primary text-foreground"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="p-1.5 rounded-lg bg-primary text-primary-foreground disabled:opacity-40"
            >
              <Send size={14} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
