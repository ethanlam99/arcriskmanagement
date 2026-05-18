import type { Config } from 'tailwindcss';

const config: Config = {
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
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '0.5rem',
      },
      boxShadow: {
        // Softer card shadow than Tailwind's default shadow-sm, tuned for
        // pure-white cards floating on a cream page background.
        card: '0 1px 2px 0 rgb(15 19 14 / 0.04), 0 1px 3px 0 rgb(15 19 14 / 0.03)',
      },
    },
  },
  plugins: [],
};

export default config;
