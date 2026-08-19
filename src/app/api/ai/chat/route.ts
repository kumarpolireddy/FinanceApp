import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

interface ChatMessage {
  role: 'user' | 'model' | 'assistant';
  content: string;
}

import { type FinancialContext } from '@/lib/aiContext';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, context }: { messages: ChatMessage[]; context?: FinancialContext } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'Messages array is required' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey || apiKey === 'your-gemini-api-key-here') {
      return NextResponse.json({
        reply: "🔑 **Gemini API Key Required**\n\nTo enable live Gemini AI financial analysis, please add your `GEMINI_API_KEY` to your `.env` file or environment settings.\n\nGet a free API key at: [Google AI Studio](https://aistudio.google.com/).",
        apiKeyMissing: true
      });
    }

    // Format comprehensive financial context into system instructions
    let contextPrompt = '';
    if (context) {
      contextPrompt = `\n\n--- USER'S COMPLETE LIVE FINANCIAL CONTEXT ---`;
      if (context.netWorth !== undefined) {
        contextPrompt += `\nCurrent Net Worth: ₹${context.netWorth.toLocaleString('en-IN')}`;
      }
      if (context.totalIncomeAllTime !== undefined || context.totalExpenseAllTime !== undefined) {
        contextPrompt += `\nAll-Time Income: ₹${(context.totalIncomeAllTime || 0).toLocaleString('en-IN')} | All-Time Expense: ₹${(context.totalExpenseAllTime || 0).toLocaleString('en-IN')} | Total Transactions: ${context.totalTransactionsCount || 0}`;
      }
      if (context.dateRange) {
        contextPrompt += `\nHistorical Date Range: ${context.dateRange.start} to ${context.dateRange.end}`;
      }
      if (context.monthlyIncome !== undefined || context.monthlyExpense !== undefined) {
        contextPrompt += `\nCurrent Month (${context.currentMonth || 'This Month'}): Income: ₹${(context.monthlyIncome || 0).toLocaleString('en-IN')} | Expense: ₹${(context.monthlyExpense || 0).toLocaleString('en-IN')}`;
      }
      if (context.accountCategories && context.accountCategories.length > 0) {
        contextPrompt += `\nAccount Categories (${context.accountCategories.length} categories): ${context.accountCategories.map((ac) => `"${ac.name}" (${ac.baseType})`).join(', ')}\n`;
      }
      if (context.accounts && context.accounts.length > 0) {
        contextPrompt += `\nAccounts, Credit Cards & Loans Details:\n` + context.accounts.map((a) => {
          const catStr = a.category ? ` [Account Category: "${a.category}"]` : '';
          const dueStr = a.dueDate ? ` | Payment Due: ${a.dueDate}th of month` : '';
          const billStr = a.billingCycle ? ` | Billing Statement Date: ${a.billingCycle}th` : '';
          const emiStr = a.emiAmount ? ` | EMI Amount: ₹${a.emiAmount} (Due Day: ${a.emiDueDay || 'Monthly'})` : '';
          return `- ${a.name} (${a.type.toUpperCase()})${catStr}: Balance ₹${a.balance.toLocaleString('en-IN')}${dueStr}${billStr}${emiStr}`;
        }).join('\n');
      }
      if (context.allTimeCategories && context.allTimeCategories.length > 0) {
        contextPrompt += `\nTop Expense Categories All-Time: ${context.allTimeCategories.map((c) => `${c.category}: ₹${c.amount.toLocaleString('en-IN')}`).join(', ')}`;
      }
      if (context.topCategories && context.topCategories.length > 0) {
        contextPrompt += `\nTop Expense Categories Current Month: ${context.topCategories.map((c) => `${c.category}: ₹${c.amount.toLocaleString('en-IN')}`).join(', ')}`;
      }
      if (context.monthlyHistory && context.monthlyHistory.length > 0) {
        contextPrompt += `\nMonthly Breakdown History (Recent Months):\n` + context.monthlyHistory.map((m) => `- ${m.month}: Income ₹${m.income.toLocaleString('en-IN')}, Expense ₹${m.expense.toLocaleString('en-IN')}`).join('\n');
      }
      if (context.monthlyCategoryBreakdown) {
        contextPrompt += `\nMonthly Category Breakdown:\n`;
        Object.entries(context.monthlyCategoryBreakdown).forEach(([m, cats]) => {
          const catStr = Object.entries(cats).map(([c, amt]) => `${c}: ₹${amt.toLocaleString('en-IN')}`).join(', ');
          contextPrompt += `- ${m}: ${catStr}\n`;
        });
      }
      if (context.budgets && context.budgets.length > 0) {
        contextPrompt += `\nBudgets: ${context.budgets.map((b) => `${b.category}: Spent ₹${b.spent.toLocaleString('en-IN')} of ₹${b.allocated.toLocaleString('en-IN')}`).join(', ')}`;
      }
      if (context.goals && context.goals.length > 0) {
        contextPrompt += `\nSavings Goals: ${context.goals.map((g) => `${g.name}: ₹${g.current.toLocaleString('en-IN')} / ₹${g.target.toLocaleString('en-IN')}`).join(', ')}`;
      }
      if (context.trips && context.trips.length > 0) {
        contextPrompt += `\nTrips & Travel Context (${context.trips.length} registered trips):\n`;
        context.trips.forEach((tr) => {
          const dest = tr.destination ? ` (Destination: ${tr.destination})` : '';
          const bgt = tr.budget ? `, Budget: ₹${tr.budget.toLocaleString('en-IN')}` : '';
          const dates = tr.startDate ? ` [Dates: ${tr.startDate}${tr.endDate ? ` to ${tr.endDate}` : ''}]` : '';
          const cats = Object.entries(tr.categoryBreakdown)
            .map(([c, amt]) => `${c}: ₹${amt.toLocaleString('en-IN')}`)
            .join(', ');
          contextPrompt += `- Trip "${tr.name}"${dest}${dates} [Status: ${tr.status.toUpperCase()}${bgt}]: Total Spent: ₹${tr.totalExpense.toLocaleString('en-IN')}, Total Income: ₹${tr.totalIncome.toLocaleString('en-IN')}, Txns: ${tr.transactionCount}. Category Breakdown: { ${cats || 'No expenses recorded yet'} }\n`;
        });
      }
      if (context.alarms && context.alarms.length > 0) {
        contextPrompt += `\nAlarms, Reminders & Scheduled Notifications (${context.alarms.length} alarms, Master Status: ${context.alarmSettings?.masterEnabled ? 'ACTIVE' : 'MUTED'}):\n`;
        context.alarms.forEach((a) => {
          const notesStr = a.notes ? ` [Notes: ${a.notes}]` : '';
          contextPrompt += `- Alarm "${a.title}" [Time: ${a.time}, Repeat: ${a.repeat}, Type: ${a.type}, Enabled: ${a.enabled ? 'YES' : 'NO'}]${notesStr}\n`;
        });
      }
      if (context.alarmLogs && context.alarmLogs.length > 0) {
        contextPrompt += `\nRecent Notification & Alarm Trigger History (${context.alarmLogs.length} items):\n` + context.alarmLogs.slice(0, 15).map((l) => {
          return `- ${l.triggeredAt}: "${l.alarmTitle}" (${l.type}) -> Status: ${l.status.toUpperCase()}${l.actionTaken ? ` [Action: ${l.actionTaken}]` : ''}`;
        }).join('\n');
      }
      if (context.splitExpenses && context.splitExpenses.length > 0) {
        contextPrompt += `\nSplit & Shared Expenses (${context.splitExpenses.length} items):\n`;
        context.splitExpenses.forEach((s) => {
          const membersStr = (s.members || []).map((m) => `${m.personName}: Share ₹${m.share}, Paid ₹${m.paid}, Pending ₹${m.pending}`).join(', ');
          contextPrompt += `- "${s.title}": Total ₹${s.totalAmount}, My Share: ₹${s.myShare}, Pending to receive: ₹${s.pendingToReceive}. Members: [ ${membersStr} ]\n`;
        });
      }
      if (context.largestExpenses && context.largestExpenses.length > 0) {
        contextPrompt += `\nLargest Single Expenses All-Time:\n` + context.largestExpenses.map((t) => {
          const sub = t.subcategory ? ` -> ${t.subcategory}` : '';
          const noteStr = t.notes ? ` [Notes: ${t.notes}]` : '';
          const tripStr = t.tripName ? ` [Trip: ${t.tripName}]` : '';
          return `- ${t.date}: ${t.description}${noteStr}${tripStr} (${t.category}${sub}) -> ₹${t.amount.toLocaleString('en-IN')} [Account: ${t.account}]`;
        }).join('\n');
      }
      if (context.recentTransactions && context.recentTransactions.length > 0) {
        contextPrompt += `\nEVERY RECORDED TRANSACTION IN DATABASE (${context.recentTransactions.length} total transactions):\n` + context.recentTransactions.map((t) => {
          const sub = t.subcategory ? ` -> ${t.subcategory}` : '';
          const noteStr = t.notes ? ` [Notes: ${t.notes}]` : '';
          const tripStr = t.tripName ? ` [Trip: ${t.tripName}]` : '';
          const splitStr = t.isSplit ? ` [Split Expense]` : '';
          const toAccStr = t.toAccount ? ` -> To: ${t.toAccount}` : '';
          return `- ${t.date}: ${t.description}${noteStr}${tripStr}${splitStr} (${t.category}${sub}) -> ₹${t.amount} [Type: ${t.type}, Account: ${t.account}${toAccStr}]`;
        }).join('\n');
      }
      contextPrompt += `\n-----------------------------------\n`;
    }

    const systemInstruction = `You are WealthIQ AI, an intelligent, empathetic, and highly accurate personal financial advisor built directly inside the WealthIQ app.
CRITICAL AUTHORITATIVE DATA DIRECTIVES:
1. FULL APP DATA ACCESS: You have complete access to ALL user financial data including EVERY single recorded transaction, accounts, credit cards, billing statement dates, loan EMI dates, budgets, savings goals, trips, alarms, reminders, notification trigger logs, and split expenses.
2. NEVER perform financial calculations from memory or estimation when exact data is available in the context.
3. USE application-provided calculated values (Net Worth, Monthly Totals, Account Balances, Category Totals, Trip Summaries, Alarms) as 100% authoritative.
4. NEVER INVENT or guess transactions, merchants, amounts, dates, account balances, categories, loans, budgets, trips, or alarms.
5. DEEP DESCRIPTION, NOTES & ALARM ANALYSIS: Read and analyze transaction descriptions, notes, subcategories, trip names, and notification/alarm details when responding to queries about spending, reminders, scheduled bills, or upcoming EMI payments.
6. ALARMS & NOTIFICATIONS ASSISTANT: When the user asks about notifications, reminders, alarms, due dates, statement dates, or scheduled alerts, inspect the configured Alarms, Notification Trigger History, Credit Card Due Dates, and Loan EMI dates and provide clear, accurate details.
7. NATURAL CONVERSATIONAL RESPONSE STYLE:
   - Speak naturally and conversationally like a human personal assistant. Synthesize merchant names, notes, amounts, dates, trips, and notification reminders into smooth, clear sentences.
   - NEVER use robotic prefaces like "Based on your transaction history...", "According to your records...", or "Looking at your data...".
   - Example ideal response style:
     "You purchased Pepe Jeans Sandals for ₹596 on March 14, 2026."
     Or:
     "Your Daily Expense Logging alarm is set for 9:00 PM every day."
8. MULTI-TURN CONVERSATIONAL CONTINUITY:
   - ALWAYS maintain context and topic continuity from preceding messages in the chat history.
   - When the user asks a follow-up question (e.g., "breakdown the shopping", "show more details", "what about food?"), infer the implicit timeframe, month, category, trip, or account from the immediately preceding conversation turn.
9. Format all financial figures using Indian Rupees (₹) with Indian number formatting (e.g. ₹1,50,000).

${contextPrompt}`;

    const ai = new GoogleGenAI({ apiKey });

    // Format chat history for Gemini SDK
    // Convert 'assistant' -> 'model'
    const formattedContents = messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : m.role,
      parts: [{ text: m.content }],
    }));

    const candidateModels = [
      'gemini-3.5-flash-lite',
      'gemini-3.5-flash',
      'gemini-flash-latest',
      'gemini-3.1-flash-lite',
      'gemini-3.6-flash',
    ];
    let responseText = '';
    let lastError = null;

    for (const model of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: formattedContents,
          config: {
            systemInstruction,
            temperature: 0.7,
            maxOutputTokens: 1024,
          },
        });
        if (response && response.text) {
          responseText = response.text;
          break;
        }
      } catch (e) {
        console.warn(`Gemini model ${model} failed, trying next candidate:`, e);
        lastError = e;
      }
    }

    if (!responseText) {
      throw lastError || new Error('All candidate Gemini models failed to respond.');
    }

    return NextResponse.json({ reply: responseText });
  } catch (err: any) {
    console.error('Gemini AI Chat Error:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to communicate with Gemini AI' },
      { status: 500 }
    );
  }
}
