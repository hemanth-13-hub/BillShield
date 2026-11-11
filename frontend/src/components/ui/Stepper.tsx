import React from "react";

export interface Step {
  title: string;
  description?: string;
}

export interface StepperProps {
  steps: Step[];
  currentStep: number; // 0-indexed
  onStepClick?: (stepIndex: number) => void;
  className?: string;
}

export const Stepper: React.FC<StepperProps> = ({
  steps,
  currentStep,
  onStepClick,
  className = "",
}) => {
  return (
    <div className={`w-full py-4 ${className}`}>
      <div className="flex items-center justify-between relative">
        {steps.map((step, idx) => {
          const isCompleted = idx < currentStep;
          const isCurrent = idx === currentStep;

          const content = (
            <>
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-colors duration-200 ${
                  isCompleted
                    ? "bg-electric-600 text-white shadow-sm"
                    : isCurrent
                    ? "bg-navy-900 text-white ring-4 ring-electric-100 shadow-sm"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700"
                }`}
              >
                {isCompleted ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  idx + 1
                )}
              </div>
              <span
                className={`mt-2 text-xs font-semibold whitespace-nowrap ${
                  isCurrent
                    ? "text-navy-900 dark:text-white font-bold"
                    : isCompleted
                    ? "text-slate-700 dark:text-slate-300"
                    : "text-slate-400"
                }`}
              >
                {step.title}
              </span>
              {step.description && (
                <span className="hidden sm:block text-[10px] text-slate-400">
                  {step.description}
                </span>
              )}
            </>
          );

          return (
            <React.Fragment key={step.title}>
              {idx > 0 && (
                <div
                  className={`flex-1 h-0.5 transition-colors duration-200 mx-2 ${
                    idx <= currentStep ? "bg-electric-600" : "bg-slate-200 dark:bg-slate-700"
                  }`}
                />
              )}

              {onStepClick ? (
                <button
                  type="button"
                  onClick={() => onStepClick(idx)}
                  aria-current={isCurrent ? "step" : undefined}
                  className="flex flex-col items-center relative cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-electric-500 rounded-lg px-1"
                >
                  {content}
                </button>
              ) : (
                <div
                  aria-current={isCurrent ? "step" : undefined}
                  className="flex flex-col items-center relative"
                >
                  {content}
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
