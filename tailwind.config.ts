import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        aegis: {
          50:  '#EFF8F9',
          100: '#B8E3E9',
          200: '#93B1B5',
          300: '#6E9499',
          500: '#4F7C82',
          600: '#3D6268',
          700: '#2A5158',
          800: '#1A3D44',
          900: '#0B2E33',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '0.5rem',
      },
    },
  },
  plugins: [],
};

export default config;
