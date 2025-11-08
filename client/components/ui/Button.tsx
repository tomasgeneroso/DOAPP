import React, { useState } from "react";
import { cn } from "@/lib/utils";

interface AnimatedButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "success" | "error";
  fullWidth?: boolean;
  children: React.ReactNode;
}

export const AnimatedButton: React.FC<AnimatedButtonProps> = ({
  variant = "primary",
  fullWidth = false,
  children,
  className,
  disabled,
  ...props
}) => {
  const [isPressed, setIsPressed] = useState(false);

  const getVariantClasses = () => {
    const baseClasses = "text-white font-bold";

    switch (variant) {
      case "primary":
        return `${baseClasses} bg-[#FF9800] hover:bg-[#FB8C00] dark:bg-[#FFB74D] dark:hover:bg-[#FFC266]`;
      case "secondary":
        return `${baseClasses} bg-[#2196F3] hover:bg-[#1E88E5] dark:bg-[#64B5F6] dark:hover:bg-[#90CAF9]`;
      case "success":
        return `${baseClasses} bg-[#81C784] hover:bg-[#66BB6A] dark:bg-[#66BB6A] dark:hover:bg-[#81C784]`;
      case "error":
        return `${baseClasses} bg-[#E57373] hover:bg-[#EF5350] dark:bg-[#EF5350] dark:hover:bg-[#E57373]`;
      default:
        return baseClasses;
    }
  };

  return (
    <button
      className={cn(
        "h-14 px-6 rounded-2xl",
        "transition-all duration-150 ease-out",
        "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#FF9800]",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        fullWidth && "w-full",
        isPressed && "scale-95",
        getVariantClasses(),
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
