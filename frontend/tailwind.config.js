/** @type {import('tailwindcss').Config} */

// Brand palette derived from the QCore logo:
//   navy   #1c2f4a  (structural / primary)
//   accent #bd5d3a  (terracotta highlight)
// `blue` is remapped to the navy scale so the app's existing accent usages pick
// up the brand color automatically; `accent` adds the warm terracotta highlight.
const navy = {
  50: "#f2f5f9",
  100: "#e2e9f1",
  200: "#c7d4e3",
  300: "#9db3cd",
  400: "#6c8bb0",
  500: "#486a94",
  600: "#38567b",
  700: "#2c4462",
  800: "#1c2f4a",
  900: "#16263c",
  950: "#0d1828",
};

const accent = {
  50: "#fbf3ef",
  100: "#f6e1d7",
  200: "#eec5b1",
  300: "#e2a182",
  400: "#d47d57",
  500: "#bd5d3a",
  600: "#a64c2e",
  700: "#8a3e27",
  800: "#6f3320",
  900: "#5b2c1d",
  950: "#31150d",
};

export default {

  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],

  theme: {
    extend: {
      colors: {
        blue: navy,
        navy,
        accent,
        brand: accent,
      },
    },
  },

  plugins: [],
}
