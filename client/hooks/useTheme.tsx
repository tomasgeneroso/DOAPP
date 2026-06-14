import { useState, useEffect } from "react";
import { colors, type ColorScheme } from "../design-system/colors";

export const useTheme = () => {
  const [isDark, setIsDark] = useState(() => {
    // Leer preferencia guardada o usar preferencia del sistema
    const saved = localStorage.getItem("theme");
    if (saved) return saved === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    // Guardar preferencia
    localStorage.setItem("theme", isDark ? "dark" : "light");

    // Aplicar clase al documento
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDark]);

  const toggleTheme = () => setIsDark(!isDark);

  return {
    isDark,
    toggleTheme,
    colors: (isDark ? colors.dark : colors.light) as ColorScheme,
  };
};
