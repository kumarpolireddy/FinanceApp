'use client';

import React, { useState, useEffect, useRef } from 'react';
import { registerPlugin, Capacitor } from '@capacitor/core';
import { toast } from 'sonner';
import {
  getAccounts,
  getCategories,
  getTransactions,
  saveTransaction,
  updateTransaction,
  deleteTransaction
} from '@/lib/storage';

// Define Capacitor Plugin interface
export interface PCManagerPlugin {
  startServer(): Promise<{ ip: string; port: number; pairingCode: string }>;
  stopServer(): Promise<void>;
  getServerStatus(): Promise<{ running: boolean; ip: string; port: number; pairingCode: string; clients: number }>;
  submitResponse(options: { requestId: string; status: number; body: string }): Promise<void>;
}

const PCManager = registerPlugin<PCManagerPlugin>('PCManager');

export default function PCManagerComponent() {
  const [isSupported, setIsSupported] = useState(false);
  const [running, setRunning] = useState(false);
  const [ip, setIp] = useState('');
  const [port, setPort] = useState(8787);
  const [pairingCode, setPairingCode] = useState('');
  const [clients, setClients] = useState(0);
  const [loading, setLoading] = useState(true);

  const statusInterval = useRef<NodeJS.Timeout | null>(null);

  // Check if running on Android/iOS Capacitor environment
  useEffect(() => {
    const supported = Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('PCManager');
    setIsSupported(supported);
    setLoading(false);

    if (supported) {
      // Check initial server status
      refreshStatus();
      
      // Start polling status (e.g. to update connected clients count)
      statusInterval.current = setInterval(() => {
        refreshStatus();
      }, 5000);
    }

    return () => {
      if (statusInterval.current) {
        clearInterval(statusInterval.current);
      }
    };
  }, []);

  // Listen to incoming relayed requests from the native server
  useEffect(() => {
    if (!isSupported) return;

    const listener = (PCManager as any).addListener('onRequest', async (req: {
      requestId: string;
      method: string;
      path: string;
      query: string;
      body: string;
    }) => {
      const { requestId, method, path, query, body } = req;
      
      try {
        const response = await handleRelayedRequest(method, path, query, body);
        await PCManager.submitResponse({
          requestId,
          status: response.status,
          body: JSON.stringify(response.body)
        });

        // Trigger a custom event to notify local components if data changed
        if (['POST', 'PUT', 'DELETE'].includes(method)) {
          window.dispatchEvent(new Event('storage'));
        }
      } catch (err: any) {
        console.error('Error handling relayed request:', err);
        await PCManager.submitResponse({
          requestId,
          status: 500,
          body: JSON.stringify({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: err.message || 'WebView failed to execute operation' }
          })
        });
      }
    });

    return () => {
      listener.remove();
    };
  }, [isSupported]);

  const refreshStatus = async () => {
    try {
      const status = await PCManager.getServerStatus();
      setRunning(status.running);
      setIp(status.ip);
      setPort(status.port);
      setPairingCode(status.pairingCode);
      setClients(status.clients);
    } catch (err) {
      console.error('Failed to get server status:', err);
    }
  };

  const handleStart = async () => {
    try {
      setLoading(true);
      const res = await PCManager.startServer();
      setRunning(true);
      setIp(res.ip);
      setPort(res.port);
      setPairingCode(res.pairingCode);
      toast.success('PC Manager started successfully!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to start PC Manager server');
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    try {
      setLoading(true);
      await PCManager.stopServer();
      setRunning(false);
      setIp('');
      setPairingCode('');
      setClients(0);
      toast.success('PC Manager stopped.');
    } catch (err: any) {
      toast.error('Failed to stop PC Manager server');
    } finally {
      setLoading(false);
    }
  };

  const serverUrl = `http://${ip}:${port}`;

  const copyToClipboard = () => {
    if (!ip) return;
    navigator.clipboard.writeText(serverUrl);
    toast.success('Address copied to clipboard!');
  };

  // WebView API Relay Handler
  const handleRelayedRequest = async (method: string, path: string, query: string, bodyStr: string) => {
    const body = bodyStr ? JSON.parse(bodyStr) : null;

    if (path === '/api/accounts') {
      if (method === 'GET') {
        return { status: 200, body: { success: true, data: getAccounts(true) } };
      }
    }

    if (path === '/api/categories') {
      if (method === 'GET') {
        return { status: 200, body: { success: true, data: getCategories() } };
      }
    }

    if (path === '/api/transactions') {
      if (method === 'GET') {
        return { status: 200, body: { success: true, data: getTransactions(true) } };
      }
      if (method === 'POST') {
        // Validation rules
        if (!body.amount || isNaN(body.amount) || body.amount <= 0) {
          return {
            status: 400,
            body: { success: false, error: { code: 'VALIDATION_ERROR', message: 'Amount must be greater than 0' } }
          };
        }
        if (!body.account) {
          return {
            status: 400,
            body: { success: false, error: { code: 'VALIDATION_ERROR', message: 'Account is required' } }
          };
        }
        if (body.type === 'transfer' && !body.toAccount) {
          return {
            status: 400,
            body: { success: false, error: { code: 'VALIDATION_ERROR', message: 'Destination account is required for transfers' } }
          };
        }
        if (body.type === 'transfer' && body.account === body.toAccount) {
          return {
            status: 400,
            body: { success: false, error: { code: 'VALIDATION_ERROR', message: 'Source and destination accounts must be different' } }
          };
        }

        const newTxn = saveTransaction({
          date: body.date || new Date().toISOString(),
          description: body.description || '',
          category: body.type === 'transfer' ? 'Transfer' : body.category || 'Other',
          subcategory: body.subcategory,
          account: body.account,
          toAccount: body.toAccount,
          amount: Number(body.amount),
          type: body.type,
          notes: body.notes
        });

        return { status: 200, body: { success: true, data: newTxn } };
      }
    }

    if (path.startsWith('/api/transactions/')) {
      const id = path.substring('/api/transactions/'.length);
      if (method === 'PUT') {
        updateTransaction(id, body);
        return { status: 200, body: { success: true } };
      }
      if (method === 'DELETE') {
        deleteTransaction(id, 'reverse');
        return { status: 200, body: { success: true } };
      }
    }

    if (path === '/api/dashboard') {
      if (method === 'GET') {
        const txns = getTransactions(true);
        const accounts = getAccounts(true);
        const totalBalance = accounts.reduce((sum, acc) => sum + (acc.balance || 0), 0);
        
        const now = new Date();
        const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        
        const thisMonthTxns = txns.filter(t => t.date && t.date.startsWith(currentMonthStr));
        const income = thisMonthTxns.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
        const expenses = thisMonthTxns.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
        const netCashFlow = income - expenses;

        return {
          status: 200,
          body: {
            success: true,
            data: {
              totalBalance,
              income,
              expenses,
              netCashFlow,
              accounts,
              recentTransactions: txns
            }
          }
        };
      }
    }

    if (path === '/api/summary') {
      if (method === 'GET') {
        return {
          status: 200,
          body: {
            success: true,
            data: {
              transactionCount: getTransactions(true).length,
              accountCount: getAccounts(true).length
            }
          }
        };
      }
    }

    if (path === '/api/export') {
      if (method === 'GET') {
        const backup: Record<string, any> = {};
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('wealthiq_')) {
            backup[key] = localStorage.getItem(key);
          }
        }
        return {
          status: 200,
          body: { success: true, data: backup }
        };
      }
    }

    return {
      status: 404,
      body: { success: false, error: { code: 'ROUTE_NOT_FOUND', message: `Route ${path} not found` } }
    };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 bg-card border border-border rounded-2xl">
        <div className="text-center space-y-2">
          <div className="animate-spin inline-block w-8 h-8 border-[3px] border-current border-t-transparent text-primary rounded-full" role="status" aria-label="loading"></div>
          <p className="text-sm text-muted-foreground">Checking PC Manager Status...</p>
        </div>
      </div>
    );
  }

  if (!isSupported) {
    return (
      <div className="card bg-card border border-border rounded-2xl p-6 text-center space-y-4">
        <span className="text-4xl block">📱</span>
        <h3 className="text-lg font-bold text-foreground">Mobile Exclusive Feature</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          PC Manager requires the application to be running natively on an Android device to start a local HTTP network server.
        </p>
        <div className="bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-xl p-3 text-xs max-w-md mx-auto">
          ⚠️ Running in browser mode. Deploy the app to Android via Capacitor to use PC Manager.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-lg font-bold text-foreground">PC Manager</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-md">
              Access and manage your WealthIQ financial transactions, accounts, and categories from any computer browser connected to the same Wi-Fi network.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${running ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {running ? 'Running' : 'Stopped'}
            </span>
          </div>
        </div>

        {running ? (
          <div className="bg-background border border-border rounded-xl p-5 space-y-5">
            <div className="space-y-2">
              <span className="text-xs text-muted-foreground font-semibold uppercase">Connection Address</span>
              <p className="text-xs text-muted-foreground">Open this URL in a desktop browser on the same Wi-Fi network:</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={serverUrl}
                  className="flex-grow bg-card border border-border rounded-lg px-3 py-2 text-sm font-mono text-primary outline-none"
                />
                <button
                  onClick={copyToClipboard}
                  className="px-4 py-2 bg-primary text-black font-semibold text-sm rounded-lg hover:bg-primary/95 transition"
                >
                  Copy Link
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border">
              <div className="space-y-1">
                <span className="text-2xs text-muted-foreground font-semibold uppercase">Security Pairing Code</span>
                <p className="text-xl font-bold font-mono text-primary tracking-wider">{pairingCode}</p>
              </div>
              <div className="space-y-1">
                <span className="text-2xs text-muted-foreground font-semibold uppercase">Connected Clients</span>
                <p className="text-xl font-bold text-primary">{clients} active</p>
              </div>
            </div>

            {/* Optional QR Code for quick mobile opening (e.g. tablet on the same Wi-Fi) */}
            <div className="flex flex-col items-center justify-center p-4 bg-card rounded-xl border border-border max-w-xs mx-auto">
              <span className="text-2xs text-muted-foreground font-semibold uppercase mb-2">Scan to open on tablet</span>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(serverUrl)}`}
                alt="PC Manager Connection QR Code"
                className="w-[140px] h-[140px] rounded-lg border border-border bg-white p-1"
              />
            </div>

            <div className="pt-2">
              <button
                onClick={handleStop}
                className="w-full py-2.5 bg-red-500/10 border border-red-500/20 text-red-500 font-semibold text-sm rounded-xl hover:bg-red-500/20 transition"
              >
                Stop PC Manager
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-background border border-border rounded-xl p-6 text-center space-y-4">
            <span className="text-3xl block">🌐</span>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">
              Server is currently offline. Press Start below to launch the local web server.
            </p>
            <button
              onClick={handleStart}
              className="px-6 py-2.5 bg-primary text-black font-semibold text-sm rounded-xl hover:bg-primary/95 transition shadow-sm"
            >
              Start PC Manager
            </button>
          </div>
        )}

        <div className="bg-card/50 border border-border/50 rounded-xl p-3.5 text-2xs text-muted-foreground leading-relaxed">
          💡 <strong>Tip:</strong> Keep the WealthIQ app open on this screen while accessing it from your PC. For security, stopping the PC Manager expires all active browser login sessions instantly.
        </div>
      </div>
    </div>
  );
}
