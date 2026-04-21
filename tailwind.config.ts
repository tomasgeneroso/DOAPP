import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: [
    './index.html',
    './client/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // ── Brand overrides matching design system ──────────────
        // These complement Tailwind's built-in sky/blue/orange/violet.
        // Dark-mode slate variants match the app's dark surfaces.
        slate: {
          50:  '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#1e2d42',  // dark border
          800: '#0f1624',  // dark card
          900: '#070d1a',  // dark background
          950: '#030a10',
        },
      },

      // ── Gradient color stops ──────────────────────────────────
      backgroundImage: {
        'gradient-brand':     'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
        'gradient-warm':      'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
        'gradient-premium':   'linear-gradient(135deg, #7c3aed 0%, #db2777 100%)',
        'gradient-hero':      'linear-gradient(135deg, #0c4a6e 0%, #0369a1 40%, #1d4ed8 100%)',
        'gradient-card-soft': 'linear-gradient(135deg, #f0f9ff 0%, #eff6ff 100%)',
        'gradient-success':   'linear-gradient(135deg, #059669 0%, #16a34a 100%)',
      },

      // ── Typography ─────────────────────────────────────────────
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },

      letterSpacing: {
        tighter: '-0.04em',
        tight:   '-0.02em',
      },

      // ── Spacing ────────────────────────────────────────────────
      spacing: {
        '13': '3.25rem',
        '15': '3.75rem',
        '18': '4.5rem',
        '22': '5.5rem',
      },

      // ── Border radius ──────────────────────────────────────────
      borderRadius: {
        '3xl': '1.5rem',
        '4xl': '2rem',
      },

      // ── Backdrop blur ──────────────────────────────────────────
      backdropBlur: {
        xs: '2px',
      },

      // ── Shadows ────────────────────────────────────────────────
      boxShadow: {
        'brand-sm': '0 1px 8px 0 rgba(2, 132, 199, 0.12)',
        'brand-md': '0 4px 16px 0 rgba(2, 132, 199, 0.20)',
        'brand-lg': '0 8px 32px 0 rgba(2, 132, 199, 0.28)',
        'card':     '0 1px 3px 0 rgba(0,0,0,0.04), 0 4px 12px 0 rgba(0,0,0,0.06)',
        'card-lg':  '0 4px 6px -1px rgba(0,0,0,0.06), 0 12px 32px -4px rgba(0,0,0,0.10)',
        'glass':    '0 8px 32px 0 rgba(31, 38, 135, 0.08)',
      },

      // ── Animations ─────────────────────────────────────────────
      keyframes: {
        fadeInUp: {
          '0%':   { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%':   { opacity: '0', transform: 'translateY(24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%':   { opacity: '0', transform: 'scale(0.92)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        btnPulse: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(2,132,199,0)' },
          '50%':      { boxShadow: '0 0 0 8px rgba(2,132,199,0.15)' },
        },
      },
      animation: {
        fadeInUp:  'fadeInUp 0.4s ease-out both',
        fadeIn:    'fadeIn 0.3s ease-out both',
        slideUp:   'slideUp 0.35s cubic-bezier(0.22, 1, 0.36, 1) both',
        scaleIn:   'scaleIn 0.25s cubic-bezier(0.22, 1, 0.36, 1) both',
        shimmer:   'shimmer 1.5s infinite',
        btnPulse:  'btnPulse 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
