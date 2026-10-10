import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#0B1F3A', soft: '#3B4C66', mute: '#6B7A90' },
        print: { DEFAULT: '#F28C28', dark: '#C96A0B', tint: '#FDEBD6' },
        paper: { DEFAULT: '#F3F5F8', card: '#FFFFFF' },
        line: '#D9DFE8',
        ok: '#1E7F4F',
        bad: '#B42318',
      },
      fontFamily: {
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
      },
      borderRadius: { card: '6px' },
    },
  },
  plugins: [],
};
export default config;
