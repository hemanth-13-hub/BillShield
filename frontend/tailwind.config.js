/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  // class-based dark mode — toggled by adding "dark" to <html>
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        navy: {
          50:  "#F0F4F8",
          100: "#D9E2EC",
          200: "#BCCCDC",
          500: "#315485",
          600: "#244370",
          700: "#1C3C6B",
          800: "#132D52",
          900: "#0B1F3A", // Primary brand deep navy
          950: "#071427",
        },
        electric: {
          50:  "#EFF6FF",
          100: "#DBEAFE",
          200: "#BFDBFE",
          400: "#60A5FA",
          500: "#3B82F6",
          600: "#2563EB", // Primary electric blue accent
          700: "#1D4ED8",
          800: "#1E40AF",
          900: "#1E3A8A",
          950: "#172554",
        },
        surface: {
          bg:     "#F4F7FB", // Soft dashboard background
          card:   "#FFFFFF",
          subtle: "#F8FAFC",
        },
        status: {
          match:       "#10B981", // Green  — Readings Match
          matchBg:     "#ECFDF5",
          variation:   "#F59E0B", // Amber  — Minor Variation
          variationBg: "#FFFBEB",
          mismatch:    "#EF4444", // Red    — Significant Mismatch
          mismatchBg:  "#FEF2F2",
        },
        dark: {
          bg:     "#0F172A",
          card:   "#1E293B",
          border: "#334155",
          text:   "#E2E8F0",
          muted:  "#94A3B8",
        },
      },
      fontFamily: {
        sans: ["'Plus Jakarta Sans'", "'Inter'", "system-ui", "sans-serif"],
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.5rem",
      },
      boxShadow: {
        xs:   "0 1px 2px 0 rgba(11, 31, 58, 0.04)",
        soft: "0 4px 20px -2px rgba(11, 31, 58, 0.05), 0 2px 6px -1px rgba(11, 31, 58, 0.03)",
        card: "0 10px 30px -4px rgba(11, 31, 58, 0.06), 0 4px 8px -2px rgba(11, 31, 58, 0.02)",
      },
    },
  },
  plugins: [],
};
