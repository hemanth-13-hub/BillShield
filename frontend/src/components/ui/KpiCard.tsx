import React from "react";
import { Card } from "./Card";

export interface KpiCardProps {
  title: string;
  value: React.ReactNode;
  unit?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  trend?: {
    value: string | number;
    isPositive?: boolean;
    label?: string;
  };
  className?: string;
}

export const KpiCard: React.FC<KpiCardProps> = ({
  title,
  value,
  unit,
  subtitle,
  icon,
  badge,
  trend,
  className = "",
}) => {
  return (
    <Card hoverEffect className={`p-5 relative overflow-hidden ${className}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-th-textMuted">
            {title}
          </p>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-extrabold text-th-text tracking-tight">
              {value}
            </span>
            {unit && <span className="text-sm font-medium text-th-textSub">{unit}</span>}
          </div>
          {subtitle && (
            <p className="mt-1 text-xs text-th-textMuted font-medium">{subtitle}</p>
          )}
          {trend && (
            <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold">
              <span
                className={`px-1.5 py-0.5 rounded-md ${
                  trend.isPositive
                    ? "bg-th-matchBg text-th-matchTxt"
                    : "bg-th-errBg text-th-errTxt"
                }`}
              >
                {trend.value}
              </span>
              {trend.label && (
                <span className="text-th-textMuted font-normal">{trend.label}</span>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-2">
          {icon && (
            <div className="w-11 h-11 rounded-xl bg-th-lavender text-th-lavenderTxt border border-th-lavenderBdr flex items-center justify-center shadow-xs">
              {icon}
            </div>
          )}
          {badge}
        </div>
      </div>
    </Card>
  );
};

