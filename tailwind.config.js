/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./devtools.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          900: '#0a0a0a',
          800: '#121212',
          700: '#1a1a1a',
          600: '#2a2a2a',
        },
        primary: {
          500: '#00f2fe',
          600: '#4facfe',
        },
        accent: {
          500: '#ff0844',
        }
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      }
    },
  },
  plugins: [],
}
