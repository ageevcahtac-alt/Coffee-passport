import type { Config } from 'tailwindcss';

// Design tokens — see DESIGN.md for rationale.
// Palette named after the cupping-table world the product lives in:
// ink (roasted bean), parchment (cupping-form paper), bark (secondary text),
// gold (the Q-score seal accent, used sparingly), moss (origin/fresh-crop tag).
const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#1C1410',
          50: '#F5F2EE',
          100: '#E6DFD5',
          200: '#C7B9A6',
          300: '#A08D74',
          400: '#6E5C48',
          500: '#4A3728',
          600: '#382A1F',
          700: '#2B2019',
          800: '#221913',
          900: '#1C1410',
        },
        parchment: {
          DEFAULT: '#F6F1E7',
          50: '#FFFFFF',
          100: '#FBF8F2',
          200: '#F6F1E7',
          300: '#EDE4D3',
          400: '#DFD1B5',
        },
        gold: {
          DEFAULT: '#B8863B',
          50: '#F4E9D6',
          100: '#EBD8B7',
          200: '#DCB97D',
          300: '#CDA155',
          400: '#B8863B',
          500: '#96692A',
          600: '#734F20',
        },
        moss: {
          DEFAULT: '#5C6B4F',
          100: '#E4E8DE',
          300: '#9AAA88',
          500: '#5C6B4F',
          700: '#3E4A35',
        },
        rating: '#A0522D',
      },
      fontFamily: {
        display: ['var(--font-display)', 'Georgia', 'serif'],
        body: ['var(--font-body)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      letterSpacing: {
        widest2: '0.22em',
      },
      backgroundImage: {
        grain: "url('/textures/paper-grain.png')",
      },
      borderRadius: {
        seal: '50%',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;