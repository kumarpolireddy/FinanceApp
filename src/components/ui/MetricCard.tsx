import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface MetricCardProps {
  label: string;
  value: string;
  subValue?: React.ReactNode;
  trend?: number;
  trendLabel?: string;
  variant?: 'default' | 'positive' | 'negative' | 'warning' | 'hero';
  icon?: React.ReactNode;
  className?: string;
  valueClassName?: string;
  largeValue?: boolean;
  compact?: boolean;
  onClick?: () => void;
}

export default function MetricCard({
  label,
  value,
  subValue,
  trend,
  trendLabel,
  variant = 'default',
  icon,
  className = '',
  valueClassName = '',
  largeValue = false,
  compact = false,
  onClick,
}: MetricCardProps) {
  const variantStyles: Record<string, string> = {
    default: 'bg-card/95 border-border shadow-card',
    positive: 'bg-card/95 border-border bg-positive-subtle border-positive-subtle shadow-card',
    negative: 'bg-card/95 border-border bg-negative-subtle border-negative-subtle card-glow-negative',
    warning: 'bg-card/95 border-border bg-warning-subtle border-warning-subtle card-glow-warning',
    hero: 'bg-card border-border card-glow-primary',
  };

  const trendPositive = trend !== undefined && trend > 0;
  const trendNegative = trend !== undefined && trend < 0;
  const surfaceStyle = compact ? 'bg-card border-border shadow-none' : variantStyles[variant];

  return (
    <div
      onClick={onClick}
      className={`metric-card ${compact ? 'metric-card-compact' : ''} relative border flex flex-col h-full transition-all duration-200 ${
        compact
          ? 'min-h-[72px] items-center justify-center rounded-lg p-2.5 text-center'
          : 'min-h-[140px] justify-between rounded-2xl p-5 md:p-6'
      } ${
        onClick
          ? compact
            ? 'cursor-pointer hover:border-primary/50 hover:bg-muted/20'
            : 'cursor-pointer hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-card-lg'
          : ''
      } ${surfaceStyle} ${className}`}
    >
      <div className={`flex items-start ${compact ? 'justify-center' : 'justify-between'}`}>
        <p className="metric-label text-2xs font-semibold tracking-wider text-muted-foreground uppercase">
          {label}
        </p>
        {icon && (
          <div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center text-muted-foreground">
            {icon}
          </div>
        )}
      </div>

      <div
        className={`${compact ? 'mt-1 flex-none items-center justify-center' : 'mt-2 flex-1 justify-end'} flex flex-col`}
      >
        <p
          className={`metric-value tabular-nums tracking-tight ${
            largeValue
              ? 'font-extrabold text-foreground'
              : variant === 'hero'
                ? 'text-hero-xl gradient-text-primary font-bold'
                : 'text-2xl font-bold text-foreground'
          } ${valueClassName}`}
          style={
            largeValue
              ? {
                  fontSize: compact
                    ? 'clamp(1rem, 1.35vw, 1.35rem)'
                    : 'clamp(1.4rem, 2vw, 2.25rem)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'clip',
                }
              : undefined
          }
        >
          {value}
        </p>
        {subValue && <div className={`text-2xs font-medium ${compact ? 'mt-0.5' : 'mt-1'}`}>{subValue}</div>}
      </div>

      {trend !== undefined && (
        <div className="flex items-center gap-1.5 mt-2">
          {trendPositive ? (
            <TrendingUp size={12} className="text-positive" />
          ) : trendNegative ? (
            <TrendingDown size={12} className="text-negative" />
          ) : (
            <Minus size={12} className="text-muted-foreground" />
          )}
          <span
            className={`text-xs font-medium tabular-nums ${
              trendPositive
                ? 'text-positive'
                : trendNegative
                  ? 'text-negative'
                  : 'text-muted-foreground'
            }`}
          >
            {trendPositive ? '+' : ''}
            {trend?.toFixed(1)}%
          </span>
          {trendLabel && <span className="text-xs text-muted-foreground">{trendLabel}</span>}
        </div>
      )}
    </div>
  );
}
