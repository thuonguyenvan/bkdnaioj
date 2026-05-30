/** @type {import('tailwindcss').Config} */
// OLPAI design tokens derived from Stitch design system (project 3884922269710536084)
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Surface scale (dark mode first)
        background:                   '#13121b',
        surface:                      '#13121b',
        'surface-dim':                '#13121b',
        'surface-bright':             '#393842',
        'surface-container-lowest':   '#0e0d16',
        'surface-container-low':      '#1b1b24',
        'surface-container':          '#1f1f28',
        'surface-container-high':     '#2a2933',
        'surface-container-highest':  '#35343e',
        // Content
        'on-surface':         '#e4e1ee',
        'on-surface-variant': '#c7c4d8',
        'inverse-surface':    '#e4e1ee',
        'inverse-on-surface': '#302f39',
        // Primary (indigo)
        primary:              '#c3c0ff',
        'primary-container':  '#4f46e5',
        'on-primary':         '#1d00a5',
        'on-primary-container': '#dad7ff',
        'inverse-primary':    '#4d44e3',
        // Secondary (cyan)
        secondary:             '#4cd7f6',
        'secondary-container': '#03b5d3',
        'on-secondary':        '#003640',
        // Tertiary (orange)
        tertiary:             '#ffb695',
        'tertiary-container': '#a44100',
        'on-tertiary':        '#571f00',
        // Borders
        outline:         '#918fa1',
        'outline-variant': '#464555',
        // Error
        error:             '#ffb4ab',
        'error-container': '#93000a',
        'on-error':        '#690005',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'Consolas', 'monospace'],
      },
      borderRadius: {
        sm:      '2px',
        DEFAULT: '4px',
        md:      '6px',
        lg:      '8px',
        xl:      '12px',
        full:    '9999px',
      },
      spacing: {
        xs:  '4px',
        sm:  '8px',
        md:  '16px',
        lg:  '24px',
        xl:  '32px',
        xxl: '48px',
      },
      boxShadow: {
        'indigo-glow':    '0 0 12px rgba(79, 70, 229, 0.35)',
        'indigo-glow-lg': '0px 10px 30px -5px rgba(79, 70, 229, 0.2)',
      },
      maxWidth: {
        container: '1440px',
      },
    },
  },
  plugins: [],
}
