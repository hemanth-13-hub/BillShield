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
        // ── Semantic Theme Tokens (backed by CSS custom properties in index.css) ──
        th: {
          bg:          "rgb(var(--bs-bg) / <alpha-value>)",
          surface:     "rgb(var(--bs-surface) / <alpha-value>)",
          card:        "rgb(var(--bs-card) / <alpha-value>)",
          elevated:    "rgb(var(--bs-elevated) / <alpha-value>)",
          highlight:   "rgb(var(--bs-highlight) / <alpha-value>)",
          border:      "rgb(var(--bs-border) / <alpha-value>)",
          borderSub:   "rgb(var(--bs-border-sub) / <alpha-value>)",
          accent:      "rgb(var(--bs-accent) / <alpha-value>)",
          accentHover: "rgb(var(--bs-accent-hover) / <alpha-value>)",
          onAccent:    "rgb(var(--bs-accent-on) / <alpha-value>)",
          accentSoft:  "rgb(var(--bs-accent-soft) / <alpha-value>)",
          accentText:  "rgb(var(--bs-accent-text) / <alpha-value>)",
          lavender:    "rgb(var(--bs-lavender) / <alpha-value>)",
          lavenderBdr: "rgb(var(--bs-lavender-bdr) / <alpha-value>)",
          lavenderTxt: "rgb(var(--bs-lavender-txt) / <alpha-value>)",
          text:        "rgb(var(--bs-text) / <alpha-value>)",
          textSub:     "rgb(var(--bs-text-sub) / <alpha-value>)",
          textMuted:   "rgb(var(--bs-text-muted) / <alpha-value>)",
          hero:        "rgb(var(--bs-hero) / <alpha-value>)",
          heroBdr:     "rgb(var(--bs-hero-bdr) / <alpha-value>)",
          heroText:    "rgb(var(--bs-hero-text) / <alpha-value>)",
          heroSub:     "rgb(var(--bs-hero-sub) / <alpha-value>)",
          secBtn:      "rgb(var(--bs-sec-btn) / <alpha-value>)",
          secBtnHover: "rgb(var(--bs-sec-btn-hover) / <alpha-value>)",
          matchBg:     "rgb(var(--bs-match-bg) / <alpha-value>)",
          matchBdr:    "rgb(var(--bs-match-bdr) / <alpha-value>)",
          matchTxt:    "rgb(var(--bs-match-txt) / <alpha-value>)",
          matchSolid:  "rgb(var(--bs-match-solid) / <alpha-value>)",
          warnBg:      "rgb(var(--bs-warn-bg) / <alpha-value>)",
          warnBdr:     "rgb(var(--bs-warn-bdr) / <alpha-value>)",
          warnTxt:     "rgb(var(--bs-warn-txt) / <alpha-value>)",
          warnSolid:   "rgb(var(--bs-warn-solid) / <alpha-value>)",
          errBg:       "rgb(var(--bs-err-bg) / <alpha-value>)",
          errBdr:      "rgb(var(--bs-err-bdr) / <alpha-value>)",
          errTxt:      "rgb(var(--bs-err-txt) / <alpha-value>)",
          errSolid:    "rgb(var(--bs-err-solid) / <alpha-value>)",
        },
        // ── LIGHT THEME PALETTE SCALES ────────────────────────────────────
        sage: {
          50:  "#F5F7F4", // Warm-white background
          100: "#E6EFEA", // Soft sage-green surface
          200: "#DCE8E0", // Gentle pastel green highlight
          300: "#CADAD1",
          400: "#9AB4A6",
          500: "#6B8F7E",
          600: "#4A6E61",
          700: "#3F5E56",
          800: "#344B45", // Dark natural grey-green text
          900: "#243530",
        },
        lavender: {
          50:  "#F4F4F9",
          100: "#EAEAF3", // Muted lavender accent
          200: "#D2D2E5",
          300: "#B4B4D1",
          400: "#8B8BB3",
          500: "#666692",
          600: "#484868",
        },
        forest: {
          900: "#344B45",
          700: "#4D6861",
          500: "#5F7A73",
          300: "#9AB2AB",
        },
        // ── DARK THEME PALETTE SCALES ─────────────────────────────────────
        charcoal: {
          950: "#101820", // Deep charcoal background
          900: "#1B2838", // Rich slate surface
          800: "#253448", // Blue-grey cards
          700: "#2D3F56", // Elevated hover surface
          600: "#344A62", // Subtle depth border
        },
        steel: {
          600: "#42596B",
          500: "#526D82", // Muted steel-blue accent
          400: "#6B889E",
          300: "#8EA9BE",
          200: "#A6C2D6",
          100: "#C8DCEB",
        },
        silver: {
          50:  "#E8F0F7", // Soft silver text
          100: "#CDD9E5",
          200: "#B6C7D6",
          400: "#90A6BA",
          600: "#5D768C",
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
        xs:   "var(--bs-shadow-xs)",
        soft: "var(--bs-shadow-soft)",
        card: "var(--bs-shadow-card)",
      },
    },
  },
  plugins: [],
};
