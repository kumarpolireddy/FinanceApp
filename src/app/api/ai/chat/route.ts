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
      if (context.accounts && context.accounts.length > 0) {
        contextPrompt += `\nAccounts & Balances: ${context.accounts.map((a) => `${a.name} (${a.type}): ₹${a.balance.toLocaleString('en-IN')}`).join(', ')}`;
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
      if (context.largestExpenses && context.largestExpenses.length > 0) {
        contextPrompt += `\nLargest Single Expenses All-Time:\n` + context.largestExpenses.map((t) => {
          const sub = t.subcategory ? ` -> ${t.subcategory}` : '';
          const noteStr = t.notes ? ` [Notes: ${t.notes}]` : '';
          return `- ${t.date}: ${t.description}${noteStr} (${t.category}${sub}) -> ₹${t.amount.toLocaleString('en-IN')} [Account: ${t.account}]`;
        }).join('\n');
      }
      if (context.recentTransactions && context.recentTransactions.length > 0) {
        contextPrompt += `\nComplete Recorded Transactions History (${context.recentTransactions.length} items):\n` + context.recentTransactions.map((t) => {
          const sub = t.subcategory ? ` -> ${t.subcategory}` : '';
          const noteStr = t.notes ? ` [Notes: ${t.notes}]` : '';
          return `- ${t.date}: ${t.description}${noteStr} (${t.category}${sub}) -> ₹${t.amount} [Type: ${t.type}, Account: ${t.account}]`;
        }).join('\n');
      }
      contextPrompt += `\n-----------------------------------\n`;
    }

    const systemInstruction = `You are WealthIQ AI, an intelligent, empathetic, and highly accurate personal financial advisor built directly inside the WealthIQ app.
CRITICAL AUTHORITATIVE DATA DIRECTIVES:
1. NEVER perform financial calculations from memory or estimation when exact data is available in the context.
2. USE application-provided calculated values (Net Worth, Monthly Totals, Account Balances, Category Totals) as 100% authoritative.
3. NEVER INVENT or guess:
   - transactions
   - merchants
   - amounts
   - dates
   - account balances
   - categories
   - loans
   - budgets
4. If the requested information is not present in the provided data or cannot be determined reliably, say so explicitly.
5. Do NOT claim that a transaction exists merely because it is plausible.
6. Do NOT infer a financial fact that is not supported by the provided data.
7. DEEP DESCRIPTION & NOTES ANALYSIS: When answering spending queries, read and analyze transaction descriptions, notes, and subcategories to identify specific merchants, items, and exact user notes.
8. NATURAL CONVERSATIONAL RESPONSE STYLE:
   - Speak naturally and conversationally like a human personal assistant. Synthesize merchant names, notes, amounts, and dates into smooth, clear sentences.
   - NEVER use robotic prefaces like "Based on your transaction history...", "According to your records...", or "Looking at your data...".
   - Example ideal response style:
     "You purchased Pepe Jeans Sandals for ₹596 on March 14, 2026."
     Or:
     "On March 14, 2026, you bought Pepe Jeans Sandals for ₹596 under Shopping."
9. MULTI-TURN CONVERSATIONAL CONTINUITY:
   - ALWAYS maintain context and topic continuity from preceding messages in the chat history.
   - When the user asks a follow-up question (e.g., "breakdown the shopping", "show more details", "what about food?"), infer the implicit timeframe, month, category, or account from the immediately preceding conversation turn.
   - Example: If the user previously asked about "Jan 2026 summary" and then asks "breakdown the shopping", interpret this as "Show the breakdown for Shopping in January 2026".
10. Format all financial figures using Indian Rupees (₹) with Indian number formatting (e.g. ₹1,50,000).

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
