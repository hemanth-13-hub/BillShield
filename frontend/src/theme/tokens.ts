/**
 * BillShield Design Tokens v2
 * Single source of truth for colors, radius, shadows, typography, and chart palettes.
 *
 * LIGHT theme: Warm-white (#F5F7F4), soft sage surfaces (#E6EFEA),
 *              muted lavender accents (#EAEAF3), pastel green highlights (#DCE8E0),
 *              and natural grey-green text (#344B45).
 * DARK  theme: Deep charcoal (#101820), rich slate surfaces (#1B2838),
 *              blue-grey cards (#253448), muted steel-blue accents (#526D82),
 *              and soft silver text (#E8F0F7).
 */

export const tokens = {
  colors: {
    light: {
      bg:         "#F5F7F4",
      surface:    "#E6EFEA",
      card:       "#FAFBF9",
      elevated:   "#EEF4F0",
      highlight:  "#DCE8E0",
      border:     "#CADAD1",
      borderSub:  "#DCE8E0",
      accent:     "#3F5E56",
      accentSoft: "#DCE8E0",
      lavender:   "#EAEAF3",
      text:       "#344B45",
      textSub:    "#4D6861",
      textMuted:  "#526C65",
    },
    dark: {
      bg:         "#101820",
      surface:    "#1B2838",
      card:       "#253448",
      elevated:   "#2D3F56",
      highlight:  "#30445C",
      border:     "#344A62",
      borderSub:  "#2C3E54",
      accent:     "#526D82",
      accentSoft: "#26384C",
      lavender:   "#243246",
      text:       "#E8F0F7",
      textSub:    "#B6C7D6",
      textMuted:  "#98AEBF",
    },
    status: {
      match: {
        text:   "#1F5C43",
        bg:     "#DEEEE4",
        border: "#ADD3BE",
        solid:  "#2E7D5B",
        label:  "Readings Match",
      },
      variation: {
        text:   "#735116",
        bg:     "#F7EEDB",
        border: "#DFC896",
        solid:  "#B8862D",
        label:  "Minor Variation",
      },
      mismatch: {
        text:   "#8C2D2D",
        bg:     "#F7E5E4",
        border: "#E0B3B0",
        solid:  "#B54444",
        label:  "Significant Mismatch",
      },
    },
  },

  radius: {
    sm:   "0.375rem",
    md:   "0.5rem",
    lg:   "0.75rem",
    xl:   "1rem",
    "2xl":"1rem",
    "3xl":"1.5rem",
    full: "9999px",
  },

  shadows: {
    soft: "var(--bs-shadow-soft)",
    card: "var(--bs-shadow-card)",
  },

  typography: {
    fontSans: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif",
  },
} as const;

/** Coordinated, muted chart colors for Recharts across Light and Dark modes */
export function getChartPalette(isDark: boolean) {
  if (isDark) {
    return {
      roomSeries:   "#8CAEC6", // Muted light steel-blue
      hostelSeries: "#7FB09C", // Muted sage-mint
      diffSeries:   "#D4A147", // Muted warm ochre
      acSeries:     "#8CAEC6",
      nonAcSeries:  "#7FB09C",
      axisStroke:   "#344A62",
      axisTick:     "#98AEBF",
      gridStroke:   "#2C3E54",
      tooltipBg:    "#1B2838",
      tooltipBdr:   "#344A62",
      tooltipText:  "#E8F0F7",
      tooltipMuted: "#B6C7D6",
    };
  }
  return {
    roomSeries:   "#526D82", // Muted steel-blue
    hostelSeries: "#4E8270", // Muted sage-teal
    diffSeries:   "#B8862D", // Muted ochre
    acSeries:     "#526D82",
    nonAcSeries:  "#4E8270",
    axisStroke:   "#CADAD1",
    axisTick:     "#526C65",
    gridStroke:   "#DCE8E0",
    tooltipBg:    "#FAFBF9",
    tooltipBdr:   "#CADAD1",
    tooltipText:  "#344B45",
    tooltipMuted: "#5F7A73",
  };
}

export type DesignTokens = typeof tokens;


