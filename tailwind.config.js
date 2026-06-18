/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // semantic surfaces — driven by CSS variables, themeable (dark/light)
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        sidebar: 'rgb(var(--sidebar) / <alpha-value>)',
        card: 'rgb(var(--card) / <alpha-value>)',
        raised: 'rgb(var(--raised) / <alpha-value>)',
        field: 'rgb(var(--input-bg) / <alpha-value>)',
        highlight: 'rgb(var(--highlight) / <alpha-value>)',
        'sidebar-active': 'rgb(var(--sidebar-active) / <alpha-value>)',
        edge: 'rgb(var(--edge) / <alpha-value>)',
        accent: 'rgb(var(--accent-rgb) / <alpha-value>)',
        'accent-hover': 'rgb(var(--accent-hover-rgb) / <alpha-value>)',
        'accent-bright': 'rgb(var(--accent-bright-rgb) / <alpha-value>)',
        'accent-subtle': 'rgb(var(--accent-subtle) / <alpha-value>)',
        // text hierarchy: `white` and the zinc scale flip with the theme.
        // Use literal values (e.g. text-[#fff]) for white-on-accent/over-image cases.
        white: 'rgb(var(--ink-0) / <alpha-value>)',
        zinc: {
          100: 'rgb(var(--ink-100) / <alpha-value>)',
          200: 'rgb(var(--ink-200) / <alpha-value>)',
          300: 'rgb(var(--ink-300) / <alpha-value>)',
          400: 'rgb(var(--ink-400) / <alpha-value>)',
          500: 'rgb(var(--ink-500) / <alpha-value>)',
          600: 'rgb(var(--ink-600) / <alpha-value>)',
          700: 'rgb(var(--ink-700) / <alpha-value>)',
          800: 'rgb(var(--ink-800) / <alpha-value>)',
        },
        success: 'rgb(var(--c-success) / <alpha-value>)',
        danger: 'rgb(var(--c-danger) / <alpha-value>)',
        'st-watching': '#7aa8c4',
        'st-completed': '#6fb06f',
        'st-planned': '#8a8278',
        'st-onhold': '#c9a96b',
        'st-dropped': '#c47a7a',
      },
      fontFamily: {
        sans: ['Inter Variable', 'Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.18s ease-out',
        'slide-in-right': 'slideInRight 0.22s cubic-bezier(0.2, 0, 0, 1)',
        'slide-up': 'slideUp 0.22s ease-out',
        'scale-in': 'scaleIn 0.16s ease-out',
        'check-pop': 'checkPop 0.42s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'task-leave': 'taskLeave 0.46s cubic-bezier(0.4, 0, 0.2, 1) forwards',
        // staggered list entrances (backwards fill = no flash during the per-item delay)
        'fade-up': 'fadeUp 0.42s cubic-bezier(0.2, 0, 0, 1) backwards',
        'pop-in': 'popIn 0.34s cubic-bezier(0.34, 1.56, 0.64, 1) backwards',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        popIn: {
          from: { opacity: '0', transform: 'scale(0.85)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        slideInRight: {
          from: { opacity: '0', transform: 'translateX(16px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          from: { opacity: '0', transform: 'scale(0.98) translateY(-6px)' },
          to: { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        // the completion circle springs as it fills, then settles
        checkPop: {
          '0%': { transform: 'scale(0.5)' },
          '45%': { transform: 'scale(1.18)' },
          '72%': { transform: 'scale(0.94)' },
          '100%': { transform: 'scale(1)' },
        },
        // a checked row holds briefly (so the fill is visible) then fades + glides out
        taskLeave: {
          '0%': { opacity: '1' },
          '38%': { opacity: '1', transform: 'none' },
          '100%': { opacity: '0', transform: 'translateX(6px) scale(0.985)' },
        },
      },
    },
  },
  plugins: [],
}
