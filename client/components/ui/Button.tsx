import React, { useState } from "react";
import { cn } from "@/lib/utils";

interface AnimatedButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "success" | "error" | "ghost" | "outline" | "premium";
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
  children: React.ReactNode;
}

export const AnimatedButton: React.FC<AnimatedButtonProps> = ({
  variant = "primary",
  size = "md",
  fullWidth = false,
  children,
  className,
  disabled,
  ...props
}) => {
  const [isPressed, setIsPressed] = useState(false);

  const variantClasses: Record<string, string> = {
    primary:
      "bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white " +
      "shadow-md shadow-sky-600/30 hover:shadow-lg hover:shadow-sky-500/40 focus:ring-sky-500",
    secondary:
      "bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white " +
      "shadow-md shadow-orange-500/25 hover:shadow-lg hover:shadow-orange-400/40 focus:ring-orange-400",
    success:
      "bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white " +
      "shadow-md shadow-emerald-600/25 hover:shadow-lg hover:shadow-emerald-500/35 focus:ring-emerald-500",
    error:
      "bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white " +
      "shadow-md shadow-red-600/20 hover:shadow-lg hover:shadow-red-500/30 focus:ring-red-500",
    ghost:
      "bg-transparent hover:bg-slate-100 dark:hover:bg-slate-700/80 " +
      "text-slate-700 dark:text-slate-200 focus:ring-slate-400",
    outline:
      "bg-transparent border border-slate-300 dark:border-slate-600 " +
      "hover:border-sky-500 dark:hover:border-sky-500 hover:bg-sky-50/50 dark:hover:bg-sky-900/10 " +
      "text-slate-700 dark:text-slate-200 hover:text-sky-700 dark:hover:text-sky-400 focus:ring-sky-400",
    premium:
      "bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white " +
      "shadow-md shadow-violet-600/30 hover:shadow-lg hover:shadow-violet-500/40 focus:ring-violet-500",
  };

  const sizeClasses: Record<string, string> = {
    sm: "h-9 px-4 text-sm rounded-xl gap-1.5",
    md: "h-11 px-5 text-sm rounded-xl gap-2",
    lg: "h-13 px-7 text-base rounded-2xl gap-2",
  };

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center font-semibold",
        "transition-all duration-200 ease-out",
        "focus:outline-none focus:ring-2 focus:ring-offset-2",
        "disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:transform-none",
        "active:scale-95",
        fullWidth && "w-full",
        isPressed && "scale-95",
        sizeClasses[size],
        variantClasses[variant],
        className,
      )}
      onMouseDown={() => setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      onMouseLeave={() => setIsPressed(false)}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
};

export default AnimatedButton;
