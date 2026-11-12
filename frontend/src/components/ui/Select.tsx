import React, { forwardRef } from "react";

export interface SelectOption {
  value: string | number;
  label: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: SelectOption[];
  error?: string;
  helperText?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, options, error, helperText, className = "", id, ...props }, ref) => {
    const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={selectId} className="block text-xs font-semibold text-th-textSub mb-1.5">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            className={`block w-full appearance-none rounded-xl border transition-colors duration-150 text-sm py-2 pl-3 pr-8 focus:outline-none bg-th-bg ${
              error
                ? "border-th-errBdr text-th-errTxt bg-th-errBg/40 focus:border-th-errSolid"
                : "border-th-border text-th-text hover:border-th-accent/60 focus:border-th-accent"
            } ${className}`}
            {...props}
          >
            {options.map((opt) => (
              <option key={opt.value} value={opt.value} className="bg-th-card text-th-text">
                {opt.label}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-th-textMuted">
            <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
              <path
                d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                clipRule="evenodd"
                fillRule="evenodd"
              />
            </svg>
          </div>
        </div>
        {error ? (
          <p className="mt-1 text-xs text-th-errTxt font-medium">{error}</p>
        ) : helperText ? (
          <p className="mt-1 text-xs text-th-textMuted">{helperText}</p>
        ) : null}
      </div>
    );
  }
);

Select.displayName = "Select";

