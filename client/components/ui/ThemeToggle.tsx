import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";

export function ThemeToggle() {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="relative inline-flex items-center justify-center w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors duration-200"
      title={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      aria-label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      aria-pressed={isDark}
    >
      <div className="relative w-5 h-5">
        {isDark ? (
          <Moon
            className="absolute inset-0 text-yellow-400 animate-in fade-in spin-in-180 duration-300"
            size={20}
            aria-hidden="true"
          />
        ) : (
          <Sun
            className="absolute inset-0 text-yellow-500 animate-in fade-in spin-in-180 duration-300"
            size={20}
            aria-hidden="true"
          />
        )}
      </div>
    </button>
  );
}

/**
 * Compact version for mobile header
 */
export function ThemeToggleCompact() {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      title={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      aria-label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      aria-pressed={isDark}
    >
      {isDark ? (
        <Moon className="text-yellow-400" size={18} aria-hidden="true" />
      ) : (
        <Sun className="text-yellow-500" size={18} aria-hidden="true" />
      )}
    </button>
  );
}
