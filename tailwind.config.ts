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
        warning:                  'rgb(var(--c-warning) / <alpha-value>)',
        success:                  'rgb(var(--c-success) / <alpha-value>)',
        sidebar:                  'rgb(var(--c-sidebar) / <alpha-value>)',
        // Colores de datos (gráficos/categorías): chart-1 = primary, el resto rota el matiz.
        ...Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`chart-${i + 1}`, `rgb(var(--c-chart-${i + 1}) / <alpha-value>)`])),
      },
      // Tamaños de letra en px enteros: la base de rem cambia con "Tamaño de la interfaz"
      // (achica espaciados) pero el texto nunca queda en medio píxel (borroso en Windows).
      fontSize: {
        '2xs': ['10px', { lineHeight: '14px' }],
        xs:   ['11px', { lineHeight: '16px' }],
        sm:   ['13px', { lineHeight: '18px' }],
        base: ['14px', { lineHeight: '20px' }],
        lg:   ['16px', { lineHeight: '24px' }],
        xl:   ['18px', { lineHeight: '26px' }],
        '2xl': ['22px', { lineHeight: '28px' }],
        '3xl': ['28px', { lineHeight: '34px' }],
        '4xl': ['34px', { lineHeight: '40px' }],
      },
      fontFamily: {
        sans: ['var(--app-font-family)', 'Inter Variable', 'Inter', 'Segoe UI Variable Text', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      // Radios y sombras salen de variables CSS (globals.css → "Forma") para poder
      // cambiar el look de toda la app desde un solo lugar.
      borderRadius: {
        sm: 'var(--radius-xs)',
        DEFAULT: 'var(--radius-sm)',
        md: 'var(--radius-sm)',
        lg: 'var(--radius-md)',
        xl: 'var(--radius-lg)',
        '2xl': 'var(--radius-xl)',
        '3xl': 'var(--radius-2xl)',
        full: '9999px',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        DEFAULT: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        xl: 'var(--shadow-lg)',
        '2xl': 'var(--shadow-pop)',
        card: 'var(--shadow-sm)',
        'card-hover': 'var(--shadow-md)',
        'card-dark': 'var(--shadow-sm)',
        'card-dark-hover': 'var(--shadow-md)',
        // Legacy "neon" → sombras neutras (el look neón quedó fuera)
        neon: 'var(--shadow-sm)',
        'neon-primary': 'var(--shadow-sm)',
        'neon-secondary': 'var(--shadow-sm)',
        'neon-btn': 'var(--shadow-sm)',
      },
      borderColor: {
        hairline: 'var(--hairline)',
        'hairline-strong': 'var(--hairline-strong)',
      },
    },
  },
  plugins: [],
}

export default config
