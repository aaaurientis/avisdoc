import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        avisdoc: {
          teal: "hsl(var(--avisdoc-teal))",
          "teal-soft": "hsl(var(--avisdoc-teal-soft))",
          sage: "hsl(var(--avisdoc-sage))",
          coral: "hsl(var(--avisdoc-coral))",
          "coral-soft": "hsl(var(--avisdoc-coral-soft))",
          cream: "hsl(var(--avisdoc-cream))",
          ink: "hsl(var(--avisdoc-ink))",
          "ink-soft": "hsl(var(--avisdoc-ink-soft))",
          mist: "hsl(var(--avisdoc-mist))",
          // Aliases rétro-compatibles
          turquoise: "hsl(var(--avisdoc-turquoise))",
          "turquoise-light": "hsl(var(--avisdoc-turquoise-light))",
          orange: "hsl(var(--avisdoc-orange))",
          "orange-light": "hsl(var(--avisdoc-orange-light))",
          navy: "hsl(var(--avisdoc-navy))",
          "navy-light": "hsl(var(--avisdoc-navy-light))",
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Fraunces', 'DM Sans', 'Georgia', 'serif'],
      },
      borderRadius: {
        sm: "calc(var(--radius) - 8px)",
        md: "calc(var(--radius) - 4px)",
        lg: "var(--radius)",
        xl: "calc(var(--radius) + 4px)",
        "2xl": "calc(var(--radius) + 12px)",
        "3xl": "calc(var(--radius) + 20px)",
        blob: "42% 58% 63% 37% / 45% 42% 58% 55%",
      },
      boxShadow: {
        soft: "var(--shadow-md)",
        raised: "var(--shadow-lg)",
        floating: "var(--shadow-xl)",
        primary: "var(--shadow-primary)",
      },
      backgroundImage: {
        "gradient-primary": "var(--gradient-primary)",
        "gradient-warm": "var(--gradient-warm)",
        "gradient-hero": "var(--gradient-hero)",
        "gradient-subtle": "var(--gradient-subtle)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(24px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        float: {
          "0%, 100%": { transform: "translate3d(0, 0, 0)" },
          "50%": { transform: "translate3d(0, -14px, 0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.7s ease-out forwards",
        "slide-up": "slide-up 0.7s cubic-bezier(0.22, 1, 0.36, 1) forwards",
        float: "float 10s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
