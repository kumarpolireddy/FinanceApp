'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import {
  Sparkles,
  Send,
  Bot,
  User,
  RefreshCw,
  Trash2,
  ChevronRight,
  TrendingUp,
  Wallet,
  Target,
  AlertCircle,
  Copy,
  Check,
  Zap,
  Info,
  Layers,
  Plane,
} from 'lucide-react';
import {
  getAccounts,
  getTransactions,
  getBudgets,
  getGoals,
  type Transaction,
  type Account,
  type Budget,
  type Goal,
} from '@/lib/storage';
import { toast } from 'sonner';
import { getFullFinancialContext } from '@/lib/aiContext';
import FormattedChatMessage from '@/components/FormattedChatMessage';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

const STARTER_PROMPTS = [
  {
    icon: TrendingUp,
    title: 'Monthly Analysis',
    prompt: '📊 Give me a complete summary and analysis of my spending and income this month.',
  },
  {
    icon: Plane,
    title: 'Trip Analysis',
    prompt: '✈️ Analyze my trip spending and give me a detailed breakdown of all my trips.',
  },
  {
    icon: Target,
    title: 'Goal Progress',
    prompt: '🎯 Analyze my savings goals and tell me if I am on track to reach them.',
  },
  {
    icon: Zap,
    title: 'Top Categories',
    prompt: '💳 What are my top expense categories and where am I overspending?',
  },
];

export default function AiAdvisorPage() {
  const STORAGE_KEY = 'wealthiq_ai_chat_history';

  const [messages, setMessages] = useState<Message[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        } catch (e) {
          console.error('Failed to parse saved chat history:', e);
        }
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

  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showTimestampId, setShowTimestampId] = useState<string | null>(null);
  const [apiKeyMissing, setApiKeyMissing] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (typeof window !== 'undefined' && messages.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    }
    scrollToBottom();
  }, [messages, loading]);

  const contextData = useMemo(() => {
    return getFullFinancialContext();
  }, []);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputMessage).trim();
    if (!text || loading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInputMessage('');
    setLoading(true);

    try {
      // Prepare messages payload for API (role: user/assistant)
      const apiMessages = newMessages
        .filter((m) => m.id !== 'welcome')
        .map((m) => ({
          role: m.role,
          content: m.content,
        }));

      const endpoint = typeof window !== 'undefined' && window.location.protocol.startsWith('http')
        ? '/api/ai/chat'
        : (process.env.NEXT_PUBLIC_SITE_URL && !process.env.NEXT_PUBLIC_SITE_URL.includes('builtwithrocket.new'))
          ? `${process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')}/api/ai/chat`
          : '/api/ai/chat';

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages.length > 0 ? apiMessages : [{ role: 'user', content: text }],
          context: contextData,
        }),
      });

      const data = await res.json();

      if (data.apiKeyMissing) {
        setApiKeyMissing(true);
      }

      if (!res.ok) {
        throw new Error(data.error || 'Failed to get response from AI');
      }

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.reply || "Sorry, I couldn't generate a response.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      console.error('Error sending message:', err);
      toast.error(err.message || 'Something went wrong communicating with Gemini.');

      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `⚠️ **Error**: ${err.message || 'Unable to connect to Gemini AI right now.'}\n\nPlease check your internet connection or verify your \`GEMINI_API_KEY\` in \`.env\`.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (id: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleClearChat = () => {
    if (confirm('Clear chat history?')) {
      const initial: Message[] = [
        {
          id: 'welcome',
          role: 'assistant',
          content: '👋 Hello! How can I assist you?',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ];
      setMessages(initial);
      if (typeof window !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  };

  return (
    <AppLayout>
      <div className="w-full max-w-md md:max-w-4xl mx-auto px-2 md:px-4 pt-1 pb-2 flex flex-col h-full overflow-hidden">
        {/* Top Actions Bar */}
        <div className="flex items-center justify-end pb-1 mb-1 border-b border-border/40 flex-shrink-0">
          <button
            onClick={handleClearChat}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-negative bg-muted/40 hover:bg-negative/10 border border-border px-2.5 py-1 rounded-lg transition"
            title="Clear chat"
          >
            <Trash2 size={13} />
            <span className="hidden sm:inline">Clear Chat</span>
          </button>
        </div>

        {/* API Key Missing Alert */}
        {apiKeyMissing && (
          <div className="mb-2 p-3 rounded-xl bg-warning-subtle border border-warning/30 flex items-start gap-3 flex-shrink-0 text-xs">
            <AlertCircle size={16} className="text-warning flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-warning">Gemini API Key missing or using placeholder key</p>
              <p className="text-muted-foreground mt-0.5">
                Add your real <code className="bg-muted px-1 py-0.5 rounded">GEMINI_API_KEY</code> in <code className="bg-muted px-1 py-0.5 rounded">.env</code> to activate live responses from Google Gemini. Get a free API key at <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer" className="underline text-primary">Google AI Studio</a>.
              </p>
            </div>
          </div>
        )}

        {/* Messages Scroll Area - ONLY THIS AREA SCROLLS */}
        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1 py-2 mb-2">
          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={msg.id}
                className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                {/* Content Bubble */}
                {(() => {
                  const isTimestampShown = showTimestampId === msg.id;
                  return (
                    <div className="group relative max-w-[92%] sm:max-w-[85%]">
                      <div
                        onClick={() => setShowTimestampId(isTimestampShown ? null : msg.id)}
                        className={`rounded-2xl px-4 py-3 text-sm leading-relaxed cursor-pointer select-text transition-all ${
                          isUser
                            ? 'bg-primary text-primary-foreground rounded-tr-none'
                            : 'bg-card border border-border text-foreground rounded-tl-none shadow-sm'
                        }`}
                      >
                        <FormattedChatMessage content={msg.content} isUser={isUser} />

                        {/* Timestamp displayed only when tapped */}
                        {isTimestampShown && (
                          <div
                            className={`flex items-center justify-between mt-2 pt-1.5 border-t text-2xs animate-fade-in ${
                              isUser
                                ? 'border-primary-foreground/20 text-primary-foreground/80'
                                : 'border-border/60 text-muted-foreground'
                            }`}
                          >
                            <span>{msg.timestamp}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopy(msg.id, msg.content);
                              }}
                              className="p-1 hover:text-foreground transition cursor-pointer"
                              title="Copy message"
                            >
                              {copiedId === msg.id ? <Check size={12} /> : <Copy size={12} />}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-card border border-border rounded-2xl rounded-tl-none px-4 py-3 text-sm flex items-center gap-2 text-muted-foreground shadow-sm">
                <RefreshCw size={14} className="animate-spin text-primary" />
                <span>Analyzing your financial data...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Starter Prompt Chips (only shown if few messages) */}
        {messages.length <= 2 && !loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2 flex-shrink-0">
            {STARTER_PROMPTS.map((item, idx) => {
              const Icon = item.icon;
              return (
                <button
                  key={idx}
                  onClick={() => handleSendMessage(item.prompt)}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-card border border-border hover:border-primary/50 hover:bg-primary/5 text-left transition group"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                      <Icon size={14} />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-foreground">{item.title}</p>
                      <p className="text-2xs text-muted-foreground truncate max-w-[220px]">
                        {item.prompt}
                      </p>
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-muted-foreground group-hover:text-primary transition" />
                </button>
              );
            })}
          </div>
        )}

        {/* Input Bar - Absolutely Stationed at Bottom */}
        <div className="flex-shrink-0 bg-background pt-2 pb-1 border-t border-border z-10">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2 bg-card border border-border rounded-xl p-2 shadow-md focus-within:border-primary transition"
          >
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Type a message..."
              disabled={loading}
              className="flex-1 bg-transparent border-none outline-none text-sm px-2 text-foreground placeholder:text-muted-foreground disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!inputMessage.trim() || loading}
              className="w-10 h-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/90 transition flex-shrink-0"
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      </div>
    </AppLayout>
  );
}
