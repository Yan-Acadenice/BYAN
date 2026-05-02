/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './main.tsx',
    './App.tsx',
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    '../../api/webui/src/**/*.{js,jsx}'
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace']
      },
      colors: {
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
        cyan: {
          glow: '#06b6d4'
        },
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
          100: '#e2e8f0'
        }
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
