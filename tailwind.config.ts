import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Warm-charcoal scale (replaces the prior teal-tinged scale).
        // Page background is cream (arc-50); sidebar is near-black (arc-900);
        // borders and muted text use the 200–500 range.
        arc: {
          50:  '#F5F1EA',
          100: '#EDE6DA',
          200: '#D4CFC5',
          300: '#A39C8D',
          500: '#5C5448',
          600: '#3F3A30',
          700: '#2E2A22',
          800: '#1F1C17',
          900: '#15130E',
        },
        // Forest-green accent — replaces all prior teal usage for "Live",
        // CTAs, active states, and accent washes.
        forest: {
          50:  '#E8EDE7',
          100: '#D2DBD0',
          500: '#2D4A3A',
          600: '#243B2E',
          700: '#1B2C23',
        },
        // Dark-mode palette — rich-noir aesthetic. Deep forest-tinted
        // backgrounds, prominent forest accent, sparing warm amber for
        // primary hovers. Deliberately fewer tones than the light palette;
        // expand if specific surfaces need more granularity.
        'arc-dark': {
          50:  '#1E2820',
          100: '#1A231C',
          200: '#243029',
          300: '#3D4E43',
          500: '#7A8C81',
          700: '#C5CFC8',
          900: '#0E1310',
        },
        'forest-dark': {
          500: '#3D6650',
          600: '#4A7860',
          700: '#5C8A72',
        },
        'amber-accent': {
          400: '#D4A555',
          500: '#C49545',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '0.5rem',
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(15 19 14 / 0.04), 0 1px 3px 0 rgb(15 19 14 / 0.03)',
      },
    },
  },
  plugins: [],
};

export default config;
