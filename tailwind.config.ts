import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{html,js,jsx,ts,tsx}', './index.html'],
  theme: {
    extend: {
      colors: {
        background:               'rgb(var(--c-background) / <alpha-value>)',
        surface:                  'rgb(var(--c-surface) / <alpha-value>)',
        'surface-container-low':  'rgb(var(--c-surface-container-low) / <alpha-value>)',
        'surface-container':      'rgb(var(--c-surface-container) / <alpha-value>)',
        'surface-container-high': 'rgb(var(--c-surface-container-high) / <alpha-value>)',
        'surface-container-highest': 'rgb(var(--c-surface-container-highest) / <alpha-value>)',
        'on-surface':             'rgb(var(--c-on-surface) / <alpha-value>)',
        'on-surface-variant':     'rgb(var(--c-on-surface-variant) / <alpha-value>)',
        primary:                  'rgb(var(--c-primary) / <alpha-value>)',
        'primary-light':          'rgb(var(--c-primary-light) / <alpha-value>)',
        'on-primary':             'rgb(var(--c-on-primary) / <alpha-value>)',
        secondary:                'rgb(var(--c-secondary) / <alpha-value>)',
        'on-secondary':           'rgb(var(--c-on-secondary) / <alpha-value>)',
        accent:                   'rgb(var(--c-accent) / <alpha-value>)',
        'outline-variant':        'rgb(var(--c-outline-variant) / <alpha-value>)',
        outline:                  'rgb(var(--c-outline) / <alpha-value>)',
        error:                    'rgb(var(--c-error) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', 'SF Pro Display', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '0.375rem',
        lg: '0.5rem',
        xl: '0.75rem',
        '2xl': '1rem',
        full: '9999px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        'card-hover': '0 4px 12px rgba(0,0,0,0.10), 0 2px 4px rgba(0,0,0,0.06)',
        'card-dark': '0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2)',
        'card-dark-hover': '0 4px 12px rgba(0,0,0,0.4)',
        neon: '0 0 40px rgba(136,124,253,0.08)',
        'neon-primary': '0 0 15px rgba(136,124,253,0.25)',
        'neon-secondary': '0 0 15px rgba(72,150,254,0.25)',
        'neon-btn': '0 0 20px rgba(136,124,253,0.35)',
      },
    },
  },
  plugins: [],
}

export default config
