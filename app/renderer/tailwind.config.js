/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './**/*.{ts,tsx,html}',
    '!**/node_modules/**',
    '!**/dist/**',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        // Stitch design system font aliases
        'h1': ['Inter'],
        'h2': ['Inter'],
        'h3': ['Inter'],
        'body': ['Inter'],
        'body-sm': ['Inter'],
        'display': ['Inter'],
        'caption': ['Inter'],
        'label': ['Inter'],
        'mono-code': ['JetBrains Mono'],
      },
      fontSize: {
        // Stitch design system text scale
        'display': ['32px', { lineHeight: '40px', letterSpacing: '-0.02em', fontWeight: '600' }],
        'h1': ['24px', { lineHeight: '32px', letterSpacing: '-0.01em', fontWeight: '600' }],
        'h2': ['18px', { lineHeight: '28px', fontWeight: '600' }],
        'h3': ['14px', { lineHeight: '20px', fontWeight: '600' }],
        'body': ['14px', { lineHeight: '20px', fontWeight: '400' }],
        'body-sm': ['13px', { lineHeight: '18px', fontWeight: '400' }],
        'caption': ['12px', { lineHeight: '16px', letterSpacing: '0.02em', fontWeight: '500' }],
        'label': ['11px', { lineHeight: '16px', letterSpacing: '0.18em', fontWeight: '600' }],
        'mono-code': ['13px', { lineHeight: '18px', fontWeight: '400' }],
      },
      spacing: {
        // Stitch design system spacing
        'xs': '4px',
        'sm': '8px',
        'md': '16px',
        'lg': '24px',
        'xl': '32px',
        'xxl': '48px',
        'base': '4px',
        'sidebar-width': '240px',
        'topbar-height': '48px',
        'container-max': '1280px',
      },
      borderRadius: {
        // Stitch adds these on top of Tailwind defaults
        'DEFAULT': '0.25rem',
        'lg': '0.5rem',
        'xl': '0.75rem',
        'full': '9999px',
        // Keep Tailwind's rounded-2xl (1rem) and rounded-3xl (1.5rem) via extend
      },
      colors: {
        // ---- BYAN brand ----
        byan: {
          50: '#eef2ff',
          100: '#dbe4ff',
          200: '#bac8ff',
          300: '#91a7ff',
          400: '#748ffc',
          500: '#5c7cfa',
          600: '#4c6ef5',
          700: '#4263eb',
          800: '#3b5bdb',
          900: '#364fc7'
        },
        // ---- ink scale (BYAN original + Stitch flat tokens) ----
        ink: {
          950: '#070b17',
          900: '#0a0f1e',
          850: '#0f172a',
          800: '#111827',
          700: '#1e293b',
          600: '#273246',
          500: '#334155',
          400: '#64748b',
          300: '#94a3b8',
          200: '#cbd5e1',
          100: '#e2e8f0',
        },
        // ---- Stitch Material Design 3 surface tokens ----
        surface: '#12131a',
        'surface-dim': '#12131a',
        'surface-bright': '#383941',
        'surface-container-lowest': '#0c0e15',
        'surface-container-low': '#1a1b23',
        'surface-container': '#1e1f27',
        'surface-container-high': '#282931',
        'surface-container-highest': '#33343d',
        'surface-variant': '#33343d',
        'surface-tint': '#b8c4ff',
        'on-surface': '#e2e1ec',
        'on-surface-variant': '#c4c5d6',
        'inverse-surface': '#e2e1ec',
        'inverse-on-surface': '#2f3038',
        background: '#12131a',
        'on-background': '#e2e1ec',
        // ---- Stitch primary/secondary/tertiary ----
        primary: '#b8c4ff',
        'on-primary': '#002585',
        'primary-container': '#6b89ff',
        'on-primary-container': '#001f75',
        'inverse-primary': '#2f52d0',
        'primary-fixed': '#dde1ff',
        'primary-fixed-dim': '#b8c4ff',
        'on-primary-fixed': '#001453',
        'on-primary-fixed-variant': '#0337b8',
        secondary: '#4cd7f6',
        'on-secondary': '#003640',
        'secondary-container': '#03b5d3',
        'on-secondary-container': '#00424e',
        'secondary-fixed': '#acedff',
        'secondary-fixed-dim': '#4cd7f6',
        'on-secondary-fixed': '#001f26',
        'on-secondary-fixed-variant': '#004e5c',
        tertiary: '#ffb77d',
        'on-tertiary': '#4d2600',
        'tertiary-container': '#d87812',
        'on-tertiary-container': '#432100',
        'tertiary-fixed': '#ffdcc3',
        'tertiary-fixed-dim': '#ffb77d',
        'on-tertiary-fixed': '#2f1500',
        'on-tertiary-fixed-variant': '#6e3900',
        // ---- Stitch error + outline ----
        error: '#ffb4ab',
        'on-error': '#690005',
        'error-container': '#93000a',
        'on-error-container': '#ffdad6',
        outline: '#8e90a0',
        'outline-variant': '#444654',
        // ---- Semantic accent flat tokens (Stitch design system) ----
        // These flat names are used in Stitch HTML as e.g. bg-emerald, text-amber, etc.
        // Alongside them we keep standard Tailwind scales so @apply bg-emerald-500/15 works.
        cyan: {
          glow: '#06b6d4',
          // Standard Tailwind cyan scale for /opacity utilities in @apply
          300: '#67e8f9',
          400: '#22d3ee',
          500: '#06b6d4',
          600: '#0891b2',
        },
        emerald: {
          // Flat token alias used in Stitch HTML: bg-emerald = #34d399
          DEFAULT: '#34d399',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
        },
        amber: {
          DEFAULT: '#fbbf24',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
        },
        red: {
          DEFAULT: '#f87171',
          300: '#fca5a5',
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
        },
        white: '#ffffff',
        // ---- Acadenice co-branding (single source of truth) ----
        acadenice: {
          teal: '#4cccb8',
          'teal-dark': '#50a88f',
          orange: '#fda100',
        },
      },
      boxShadow: {
        'glow-sm': '0 0 12px rgba(66, 99, 235, 0.25)',
        'glow': '0 0 24px rgba(66, 99, 235, 0.35)',
        'glow-lg': '0 0 48px rgba(66, 99, 235, 0.45)',
        'glow-cyan': '0 0 24px rgba(6, 182, 212, 0.35)',
        'glass': '0 8px 32px rgba(0, 0, 0, 0.35)',
        'glass-lg': '0 24px 60px rgba(0, 0, 0, 0.55)'
      },
      backgroundImage: {
        'grid-dark': "radial-gradient(circle at 1px 1px, rgba(148,163,184,0.08) 1px, transparent 0)",
        'hero-glow': 'radial-gradient(ellipse at top, rgba(76,110,245,0.18), transparent 60%), radial-gradient(ellipse at bottom right, rgba(6,182,212,0.12), transparent 55%)',
        'primary-gradient': 'linear-gradient(135deg, #5c7cfa 0%, #4263eb 50%, #3b5bdb 100%)',
        'cyan-gradient': 'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)'
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' }
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 18px rgba(76, 110, 245, 0.25)' },
          '50%': { boxShadow: '0 0 34px rgba(76, 110, 245, 0.55)' }
        },
        fadeInUp: {
          '0%': { opacity: 0, transform: 'translateY(8px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' }
        },
        caretBlink: {
          '0%, 100%': { opacity: 0.2 },
          '50%': { opacity: 1 }
        }
      },
      animation: {
        'shimmer': 'shimmer 2.4s linear infinite',
        'glow-pulse': 'glowPulse 2.8s ease-in-out infinite',
        'fade-in-up': 'fadeInUp 0.35s ease-out',
        'caret': 'caretBlink 1s ease-in-out infinite'
      }
    }
  },
  plugins: []
};
