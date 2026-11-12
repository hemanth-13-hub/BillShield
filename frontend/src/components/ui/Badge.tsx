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
    let styles = "bg-th-elevated text-th-textSub border-th-border";

    if (src === "Manual Entry") {
      styles = "bg-th-highlight text-th-text border-th-border";
    } else if (src === "Simulated Demo Data") {
      styles = "bg-th-warnBg text-th-warnTxt border-th-warnBdr font-bold";
    } else if (src === "Sensor (Future)") {
      styles = "bg-th-lavender text-th-lavenderTxt border-th-lavenderBdr";
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
              ? "bg-th-accent"
              : src === "Simulated Demo Data"
              ? "bg-th-warnSolid"
              : "bg-th-lavenderTxt"
          }`}
        />
        {displayLabel}
      </span>
    );
  }

  // 2. Status Verdict Variant (Muted Match / Warning / Error ONLY)
  if (variant === "status" || statusType) {
    const st = statusType || (children as Verdict);
    let styles = "bg-th-matchBg text-th-matchTxt border-th-matchBdr";

    if (st === "Readings Match") {
      styles = "bg-th-matchBg text-th-matchTxt border-th-matchBdr";
    } else if (st === "Minor Variation") {
      styles = "bg-th-warnBg text-th-warnTxt border-th-warnBdr";
    } else if (st === "Significant Mismatch") {
      styles = "bg-th-errBg text-th-errTxt border-th-errBdr";
    }

    return (
      <span
        className={`inline-flex items-center gap-1.5 font-semibold rounded-full border shadow-xs ${sizeStyles} ${styles} ${className}`}
      >
        <span
          className={`w-2 h-2 rounded-full ${
            st === "Readings Match"
              ? "bg-th-matchSolid"
              : st === "Minor Variation"
              ? "bg-th-warnSolid"
              : "bg-th-errSolid"
          }`}
        />
        {st}
      </span>
    );
  }

  // 3. Neutral / Generic Variant
  return (
    <span
      className={`inline-flex items-center font-medium rounded-md bg-th-elevated text-th-textSub border border-th-borderSub ${sizeStyles} ${className}`}
    >
      {children}
    </span>
  );
};

