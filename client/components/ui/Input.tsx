import { clsx } from "clsx";
import { InputHTMLAttributes, forwardRef } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={clsx(
          "w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-2 text-base text-slate-900 dark:text-white",
          "placeholder:text-slate-400 dark:placeholder:text-slate-500",
          "focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:focus:ring-sky-500",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";

export default Input;
