import type { FinancialContext } from './aiContext';

type GeminiMessage = {
  role: 'user' | 'assistant' | 'model';
  content: string;
};

export async function sendGeminiDirect(
  messages: GeminiMessage[],
  context?: FinancialContext | null
): Promise<string> {
  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('NEXT_PUBLIC_GEMINI_API_KEY is not configured for the mobile app.');
  }

  const contextText = context
    ? `\n\nFinancial context (use this to answer accurately):\n${JSON.stringify(context)}`
    : '';
  const contents = messages.map((message) => ({
    role: message.role === 'assistant' ? 'model' : message.role,
    parts: [{ text: `${message.content}${message.role === 'user' ? contextText : ''}` }],
  }));

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: 'You are WealthIQ, a careful personal finance assistant. Give concise, practical answers. Never invent financial data; use the supplied context when available.',
            },
          ],
        },
        contents,
        generationConfig: { temperature: 0.4 },
      }),
    }
  );

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Gemini request failed.');
  }

  const reply = data?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text || '')
    .join('')
    .trim();
  if (!reply) throw new Error('Gemini returned an empty response.');
  return reply;
}
