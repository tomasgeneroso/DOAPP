import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: [
    "./client/**/*.{ts,tsx}",
    "./index.html",
  ],
  theme: {
    extend: {
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      colors: {},
    },
  },
  plugins: [],
} satisfies Config;
