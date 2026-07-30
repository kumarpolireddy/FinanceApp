import React from 'react';

interface SkeletonProps {
  className?: string;
  lines?: number;
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton-pulse rounded-md ${className}`} />;
}

export function CardSkeleton() {
  return (
    <div className="bg-card border border-border rounded-xl p-5 flex flex-col gap-3">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-8 w-36" />
      <Skeleton className="h-3 w-16" />
    </div>
  );
}

export function TableSkeleton({ rows = 8, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div key={`skel-row-${rowIdx + 1}`} className="flex gap-4 px-4 py-3 border-b border-border">
          {Array.from({ length: cols }).map((_, colIdx) => (
            <Skeleton key={`skel-cell-${rowIdx + 1}-${colIdx + 1}`} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton({ height = 280 }: { height?: number }) {
  return <div className="w-full skeleton-pulse rounded-lg" style={{ height }} />;
}

export default function LoadingSkeleton({ lines = 3, className = '' }: SkeletonProps) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={`line-${i + 1}`} className={`h-4 ${i === lines - 1 ? 'w-3/4' : 'w-full'}`} />
      ))}
    </div>
  );
}
