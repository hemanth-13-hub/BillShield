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
                    ? "bg-th-accent text-th-onAccent shadow-xs"
                    : isCurrent
                    ? "bg-th-accent text-th-onAccent ring-4 ring-th-highlight shadow-xs"
                    : "bg-th-elevated text-th-textMuted border border-th-border"
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
                    ? "text-th-text font-bold"
                    : isCompleted
                    ? "text-th-textSub"
                    : "text-th-textMuted"
                }`}
              >
                {step.title}
              </span>
              {step.description && (
                <span className="hidden sm:block text-[10px] text-th-textMuted">
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
                    idx <= currentStep ? "bg-th-accent" : "bg-th-border"
                  }`}
                />
              )}

              {onStepClick ? (
                <button
                  type="button"
                  onClick={() => onStepClick(idx)}
                  aria-current={isCurrent ? "step" : undefined}
                  className="flex flex-col items-center relative cursor-pointer focus:outline-none rounded-lg px-1"
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
