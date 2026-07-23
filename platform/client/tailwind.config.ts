import type { Config } from "tailwindcss";

// Charte AvisDoc. Cyan/orange réservés aux fonds sombres et éléments graphiques :
// jamais du texte sur crème (contraste < 3:1).
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        creme: "#F7F4EF",
        marine: "#142A33",
        cyan: "#0CA6DF",
        orange: "#EC7735",
        ardoise: "#5C6A6E",
        filet: "#ECE6DC",
      },
      fontFamily: {
        sans: ["Hanken Grotesk", "Calibri", "system-ui", "sans-serif"],
        serif: ["Newsreader", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
