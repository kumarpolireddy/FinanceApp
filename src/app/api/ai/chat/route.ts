import { NextResponse } from 'next/server';

// Legacy clients must upgrade to device-owned credentials; never use a server key.
export async function POST() {
  return NextResponse.json(
    {
      error: 'Configure your own Gemini API key in Settings and use the updated AI Assistant.',
      apiKeyMissing: true,
    },
    { status: 410 }
  );
}
