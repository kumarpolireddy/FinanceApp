'use client';

import React, { useState, useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import SavingsTrendChart from './components/SavingsTrendChart';
import CategoryYoYChart from './components/CategoryYoYChart';
import SpendingHeatmap from './components/SpendingHeatmap';
import WeekdayWeekendChart from './components/WeekdayWeekendChart';
import TopMerchantsTable from './components/TopMerchantsTable';
import AiInsightsPanel from './components/AiInsightsPanel';
import { getTransactions, type Transaction } from '@/lib/storage';

export default function AnalyticsPage() {
  const [activeSlide, setActiveSlide] = useState(0);
  const touchStartX = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    const rect = e.currentTarget.getBoundingClientRect();
    const relativeX = touch.clientX - rect.left;
    if (relativeX < 80) {
      touchStartX.current = null;
      return;
    }
    touchStartX.current = touch.clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diffX = touchStartX.current - e.changedTouches[0].clientX;
    const threshold = 50; // minimum pixels to count as swipe
    if (Math.abs(diffX) > threshold) {
      if (diffX > 0) {
        // Swiped Left: next month
        window.dispatchEvent(new CustomEvent('analytics-month-swipe', { detail: { delta: 1 } }));
      } else {
        // Swiped Right: previous month
        window.dispatchEvent(new CustomEvent('analytics-month-swipe', { detail: { delta: -1 } }));
      }
    }
    touchStartX.current = null;
  };

  const allTransactions = useMemo(() => getTransactions(), []);

  return (
    <AppLayout>
      <div className="w-full min-h-screen px-0 pt-0 pb-32 space-y-4 bg-secondary/70">
        {/* Swipeable Graph Carousel */}
        <div className="select-none mb-6 pt-3">
          
          {/* Slider Controls & Sliding Progress Indicator Bar */}
          <div className="flex items-center justify-between mb-3 px-3 sm:px-6 py-2">
            <button
              disabled={activeSlide === 0}
              onClick={() => setActiveSlide((p) => Math.max(p - 1, 0))}
              className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:pointer-events-none transition active:scale-95"
              aria-label="Previous chart"
            >
              <ChevronLeft size={18} />
            </button>

            {/* Sliding Progress Indicator Bar with background slots */}
            <div className="relative w-40 h-2 bg-[#0b0f1a] rounded-full flex items-center justify-between px-2.5 border border-border/40 select-none">
              {/* Background ticks to show availability of other graphs */}
              {[0, 1, 2, 3, 4, 5].map((idx) => (
                <div 
                  key={idx} 
                  className="w-1.5 h-1.5 rounded-full bg-slate-700/60 z-0"
                />
              ))}

              {/* Active sliding capsule */}
              <div 
                className="absolute top-0.5 bottom-0.5 bg-blue-500 border border-blue-400 rounded-full transition-all duration-300 z-10 pointer-events-none shadow-[0_0_8px_rgba(59,130,246,0.6)]"
                style={{ 
                  width: 'calc(16.66% - 4px)', 
                  left: `calc(${(activeSlide / 6) * 100}% + 2px)` 
                }}
              />
            </div>

            <button
              disabled={activeSlide === 5}
              onClick={() => setActiveSlide((p) => Math.min(p + 1, 5))}
              className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:pointer-events-none transition active:scale-95"
              aria-label="Next chart"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Unpadded Overflow Viewport for Perfect Slide Alignment */}
          <div className="w-full overflow-hidden">
            <div 
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              className="flex transition-transform duration-300 ease-out"
              style={{ transform: `translateX(-${activeSlide * 100}%)` }}
            >
              {/* Slide 0: Category Spending */}
              <div className="w-full shrink-0 px-3 sm:px-6 overflow-hidden">
                <CategoryYoYChart transactions={allTransactions} />
              </div>
              
              {/* Slide 1: Savings Trend */}
              <div className="w-full shrink-0 px-3 sm:px-6 overflow-hidden">
                <SavingsTrendChart />
              </div>

              {/* Slide 2: Weekday vs Weekend */}
              <div className="w-full shrink-0 px-3 sm:px-6 overflow-hidden">
                <WeekdayWeekendChart transactions={allTransactions} />
              </div>

              {/* Slide 3: Top Merchants */}
              <div className="w-full shrink-0 px-3 sm:px-6 overflow-hidden">
                <TopMerchantsTable allTransactions={allTransactions} />
              </div>

              {/* Slide 4: Spending Heatmap */}
              <div className="w-full shrink-0 px-3 sm:px-6 overflow-hidden">
                <SpendingHeatmap allTransactions={allTransactions} />
              </div>

              {/* Slide 5: AI Insights */}
              <div className="w-full shrink-0 px-3 sm:px-6 overflow-hidden">
                <AiInsightsPanel transactions={allTransactions} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
