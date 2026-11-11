import React from "react";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "text" | "rectangular" | "circular" | "card";
}

export const Skeleton: React.FC<SkeletonProps> = ({
  variant = "rectangular",
  className = "",
  ...props
}) => {
  const base = "animate-pulse bg-slate-200/80";

  const variantStyles = {
    text: "h-4 w-full rounded",
    rectangular: "rounded-xl",
    circular: "rounded-full",
    card: "h-36 rounded-2xl",
  };

  return (
    <div
      className={`${base} ${variantStyles[variant]} ${className}`}
      {...props}
    />
  );
};

