import React from "react";
import type { ReadingSource, Verdict } from "../../types/api";

export type BadgeVariant =
  | "source"
  | "status"
  | "neutral"
  | "outline";

export interface BadgeProps {
  children?: React.ReactNode;
  variant?: BadgeVariant;
  sourceType?: ReadingSource;
  statusType?: Verdict;
  size?: "sm" | "md";
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = "neutral",
  sourceType,
  statusType,
  size = "md",
  className = "",
}) => {
  const sizeStyles = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";

  // 1. Source Tag Variant
  if (variant === "source" || sourceType) {
    const src = sourceType || (children as ReadingSource);
    let styles = "bg-slate-100 text-slate-700 border-slate-200";

    if (src === "Manual Entry") {
      styles = "bg-blue-50 text-blue-700 border-blue-200";
    } else if (src === "Simulated Demo Data") {
      styles = "bg-amber-100 text-amber-900 border-amber-400 font-bold";
    } else if (src === "Sensor (Future)") {
      styles = "bg-purple-50 text-purple-700 border-purple-200";
    }

    const displayLabel = src === "Simulated Demo Data" ? "SIMULATED DATA" : src;

    return (
      <span
        title={src}
        className={`inline-flex items-center gap-1.5 font-medium rounded-full border tracking-wide uppercase text-[10px] ${sizeStyles} ${styles} ${className}`}
      >
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            src === "Manual Entry"
              ? "bg-blue-500"
              : src === "Simulated Demo Data"
              ? "bg-amber-600"
              : "bg-purple-500"
          }`}
        />
        {displayLabel}
      </span>
    );
  }

  // 2. Status Verdict Variant (Green / Amber / Red ONLY)
  if (variant === "status" || statusType) {
    const st = statusType || (children as Verdict);
    let styles = "bg-emerald-50 text-emerald-800 border-emerald-200";

    if (st === "Readings Match") {
      styles = "bg-emerald-50 text-emerald-800 border-emerald-300";
    } else if (st === "Minor Variation") {
      styles = "bg-amber-50 text-amber-800 border-amber-300";
    } else if (st === "Significant Mismatch") {
      styles = "bg-rose-50 text-rose-800 border-rose-300";
    }

    return (
      <span
        className={`inline-flex items-center gap-1.5 font-semibold rounded-full border shadow-sm ${sizeStyles} ${styles} ${className}`}
      >
        <span
          className={`w-2 h-2 rounded-full ${
            st === "Readings Match"
              ? "bg-emerald-500"
              : st === "Minor Variation"
              ? "bg-amber-500"
              : "bg-rose-500"
          }`}
        />
        {st}
      </span>
    );
  }

  // 3. Neutral / Generic Variant
  return (
    <span
      className={`inline-flex items-center font-medium rounded-md bg-slate-100 text-slate-700 ${sizeStyles} ${className}`}
    >
      {children}
    </span>
  );
};

