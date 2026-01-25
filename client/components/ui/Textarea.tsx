import { clsx } from "clsx";
import { TextareaHTMLAttributes, forwardRef } from "react";

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={clsx(
          "w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-3 text-base text-slate-900 dark:text-white",
          "placeholder:text-slate-400 dark:placeholder:text-slate-500",
          "focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:focus:ring-sky-500",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "resize-none",
          className
        )}
        {...props}
      />
    );
  }
);

Textarea.displayName = "Textarea";

export default Textarea;
