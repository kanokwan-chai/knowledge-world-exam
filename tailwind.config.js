/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        kw: {
          red: '#E52521',
          blue: '#049CD8',
          yellow: '#FBD000',
          green: '#43B047',
          orange: '#F57D00',
          sky: '#5C94FC',
          brick: '#C84C0C',
          cream: '#FFFDF5',
        }
      },
      fontFamily: {
        display: ['"Fredoka"', '"Kanit"', 'sans-serif'],
        sans: ['"Kanit"', '"Inter"', 'sans-serif'],
      },
      boxShadow: {
        'block': '0 6px 0 0 rgba(0,0,0,0.28), inset 0 3px 0 0 rgba(255,255,255,0.45)',
        'block-sm': '0 4px 0 0 rgba(0,0,0,0.25), inset 0 2px 0 0 rgba(255,255,255,0.4)',
        'block-active': '0 2px 0 0 rgba(0,0,0,0.28), inset 0 2px 0 0 rgba(255,255,255,0.35)',
        'card-3d': '0 8px 0 0 #1E293B, 0 12px 24px -4px rgba(0,0,0,0.18)',
      }
    },
  },
  plugins: [],
}
