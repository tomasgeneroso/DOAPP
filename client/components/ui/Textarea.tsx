import { clsx } from "clsx";
import { TextareaHTMLAttributes, forwardRef } from "react";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={clsx(
          "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900",
          "placeholder:text-slate-400",
          "focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200",
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
