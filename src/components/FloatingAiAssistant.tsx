'use client';

import { Bot } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';

export default function FloatingAiAssistant() {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname?.startsWith('/ai-advisor')) {
    return null;
  }

  return (
    <button
      onClick={() => router.push('/ai-advisor')}
      className="fixed bottom-20 md:bottom-6 right-4 sm:right-6 z-40 w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all duration-200"
      title="Gemini AI Financial Assistant"
      aria-label="Open AI Assistant full screen"
    >
      <Bot size={24} strokeWidth={2} />
    </button>
  );
}
