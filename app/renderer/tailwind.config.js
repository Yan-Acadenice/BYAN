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
        // Semantic aliases. Titles and buttons are Josefin Sans (AcadeNice brand
        // rule); running text stays Inter; code-ish text stays JetBrains Mono (a
        // deliberate departure from AcadeNice's Courier New: this app shows file
        // paths, binary names and aligned counters all day).
        // Josefin Sans tops out at 700 — no title may carry font-black.
        'h1': ['Josefin Sans', 'Inter', 'sans-serif'],
        'h2': ['Josefin Sans', 'Inter', 'sans-serif'],
        'h3': ['Josefin Sans', 'Inter', 'sans-serif'],
        'display': ['Josefin Sans', 'Inter', 'sans-serif'],
        'body': ['Inter', 'sans-serif'],
        'body-sm': ['Inter', 'sans-serif'],
        'caption': ['Inter', 'sans-serif'],
        'label': ['Inter', 'sans-serif'],
        'mono-code': ['JetBrains Mono', 'ui-monospace', 'monospace'],
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
        // ---- AcadeNice teal — the single brand hue ----
        // Kept as literal hex, not var(), so Tailwind's /opacity modifiers keep
        // working (bg-teal-500/15). The role tokens below are var()-based and are
        // used WITHOUT an opacity modifier.
        teal: {
          50: '#EDFAF8',
          100: '#D0F5F0',
          200: '#A8EBE2',
          300: '#6ADDD0',
          400: '#4CCCB8',
          500: '#2FB5A0',
          600: '#1E8E7E',
          700: '#1C7269',
          800: '#155A53',
          900: '#0F433E',
          950: '#0A2E2A',
        },
        // ---- The AcadeNice neutral ramp ----
        // 975 and 1000 are ADDED to the system: AcadeNice is a light system and
        // stops at 950. They continue the existing progression (hue ~176) rather
        // than being picked by eye. Brand rule: no pure grey, ever — every step
        // is teal-tinted.
        neutral: {
          50: '#F7FAFA',
          100: '#EEF3F3',
          200: '#DCE8E7',
          300: '#BDD0CF',
          400: '#94B0AF',
          500: '#6B9190',
          600: '#527472',
          700: '#425E5D',
          800: '#334847',
          900: '#2A3D3C',
          950: '#1A2827',
          975: '#131E1D',
          1000: '#0C1312',
        },
        // ---- Role tokens, one commutable layer ----
        // Values live in index.css on :root (dark) and .light. ONE layer, not two
        // hand-written sets: two sets is what shifted the whole muted tier of the
        // light theme by one step (measured 2.31:1 instead of 3.3:1).
        surface: {
          page: 'var(--surface-page)',
          card: 'var(--surface-card)',
          raised: 'var(--surface-raised)',
          hover: 'var(--surface-hover)',
        },
        content: {
          strong: 'var(--text-strong)',
          body: 'var(--text-body)',
          secondary: 'var(--text-secondary)',
          // The readability FLOOR. Anything informative stops here.
          tertiary: 'var(--text-tertiary)',
          // Below the floor ON PURPOSE: the dash of an unmeasured value and
          // decorative text. Never a sentence the user must read.
          muted: 'var(--text-muted)',
        },
        edge: {
          subtle: 'var(--border-subtle)',
          strong: 'var(--border-strong)',
        },
        // Role colours through the same commutable layer, so a theme switch moves
        // them together with the surfaces instead of one step behind.
        accent: {
          action: 'var(--accent-action)',
          change: 'var(--accent-change)',
          danger: 'var(--accent-danger)',
          success: 'var(--accent-success)',
        },
        // Text placed ON a filled accent. Dark in both themes.
        'on-accent': 'var(--on-accent)',
        // ---- byan-* : ALIAS onto teal during the migration ----
        // 116 occurrences across 23 files. Remapping the ramp turns all of them
        // teal at once, with zero component edits; lot 4 then renames them for
        // cleanliness rather than for appearance. Deleting the ramp first would
        // leave the app broken for the whole chantier.
        byan: {
          50: '#EDFAF8',
          100: '#D0F5F0',
          200: '#A8EBE2',
          300: '#6ADDD0',
          400: '#4CCCB8',
          500: '#4CCCB8',
          600: '#2FB5A0',
          700: '#1E8E7E',
          800: '#155A53',
          900: '#0F433E',
        },
        // ---- ink-* : ALIAS onto the AcadeNice neutrals during the migration ----
        // 704 occurrences across 34 files. Same reasoning as byan-*, at six times
        // the scale. ink-500 was used for informative text in several places and
        // is below the floor in the new ramp — those sites move up a step in lot 4
        // rather than being translated as-is.
        ink: {
          950: '#0C1312',
          900: '#131E1D',
          850: '#1A2827',
          800: '#2A3D3C',
          700: '#334847',
          600: '#425E5D',
          500: '#527472',
          400: '#6B9190',
          300: '#94B0AF',
          200: '#BDD0CF',
          100: '#DCE8E7',
        },
        // ---- Role colours, dark-theme values ----
        // Each says one thing and nothing else. Contrasts measured on #131E1D:
        // teal 8.7 · amber 8.4 · green 7.5 · red 4.6 (short text only).
        amber: {
          DEFAULT: '#FDA100',
          300: '#FFC04D',
          400: '#FDA100',
          500: '#E08E00',
          600: '#9E5200',
        },
        red: {
          DEFAULT: '#EF4444',
          300: '#F87171',
          400: '#EF4444',
          500: '#DC2626',
          600: '#991B1B',
        },
        emerald: {
          DEFAULT: '#22C55E',
          300: '#4ADE80',
          400: '#22C55E',
          500: '#16A34A',
          600: '#065F46',
        },
        white: '#ffffff',
        // ---- Acadenice co-branding (single source of truth) ----
        // DO NOT rename this key: DashboardConnectivity.test.tsx pins
        // 'bg-acadenice-teal', and renaming it to `primary` would also re-introduce
        // the very name the dead Material tokens just freed.
        acadenice: {
          teal: '#4cccb8',
          'teal-dark': '#1E8E7E',
          orange: '#fda100',
        },
      },
      boxShadow: {
        // Glow is teal now, and RESERVED: active selection or success
        // confirmation, kept brief. It is no longer applied at rest — the brief
        // forbids it and the code carried it on .btn-primary, .nav-item-active,
        // .dot-on and .hover-lift permanently.
        'glow-sm': '0 0 12px rgba(76, 204, 184, 0.25)',
        'glow': '0 0 24px rgba(76, 204, 184, 0.35)',
        'glow-lg': '0 0 48px rgba(76, 204, 184, 0.45)',
        // A dark drop shadow with no blur behind it — despite the name, this one
        // is not glass-morphism and stays.
        'glass': '0 8px 32px rgba(0, 0, 0, 0.35)',
        'glass-lg': '0 24px 60px rgba(0, 0, 0, 0.55)',
        // The inner light edge that makes the floating layers read as a cut
        // surface rather than a translucent panel (lot 3.5).
        'edge-inset': 'inset 0 1px 0 rgba(208, 245, 240, 0.14)',
      },
      backgroundImage: {
        'grid-dark': "radial-gradient(circle at 1px 1px, rgba(208,245,240,0.06) 1px, transparent 0)",
        'hero-glow': 'radial-gradient(ellipse at top, rgba(76,204,184,0.16), transparent 60%), radial-gradient(ellipse at bottom right, rgba(76,204,184,0.08), transparent 55%)',
        // Mono-hue, as decided for the monogram: one brand colour, no second tint.
        'primary-gradient': 'linear-gradient(135deg, #6ADDD0 0%, #4CCCB8 50%, #1E8E7E 100%)',
        'teal-gradient': 'linear-gradient(135deg, #6ADDD0 0%, #1E8E7E 100%)'
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' }
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 18px rgba(76, 204, 184, 0.25)' },
          '50%': { boxShadow: '0 0 34px rgba(76, 204, 184, 0.55)' }
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
