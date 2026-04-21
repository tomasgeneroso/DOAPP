import { clsx } from "clsx";
import { InputHTMLAttributes, forwardRef } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={clsx(
          "w-full h-11 rounded-xl px-4 py-2.5 text-base",
          "border border-slate-300 dark:border-slate-600",
          "bg-white dark:bg-slate-800/80",
          "text-slate-900 dark:text-white",
          "placeholder:text-slate-400 dark:placeholder:text-slate-500",
          "shadow-sm shadow-slate-100/50 dark:shadow-slate-900/20",
          "focus:border-sky-500 dark:focus:border-sky-500",
          "focus:outline-none focus:ring-2 focus:ring-sky-200 dark:focus:ring-sky-800/60",
          "focus:bg-white dark:focus:bg-slate-800",
          "hover:border-slate-400 dark:hover:border-slate-500",
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-slate-50 dark:disabled:bg-slate-900",
          "transition-all duration-200",
          className
        )}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";

export default Input;
