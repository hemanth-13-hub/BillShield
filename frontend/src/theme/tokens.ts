/**
 * BillShield Design Tokens
 * Single source of truth for colors, radius, shadows, and typography.
 * Premium analytics dashboard aesthetic:
 *   - Dark Navy #0B1F3A
 *   - Electric Blue #2563EB
 *   - Soft Background #F4F7FB
 *   - White rounded-2xl cards with soft shadows
 *   - Status colors (green/amber/red) ONLY for match, minor variation, mismatch
 */

export const tokens = {
  colors: {
    // Primary Brand
    navy: {
      900: "#0B1F3A", // Deep Navy Header & Sidebar
      800: "#132D52",
      700: "#1C3C6B",
      500: "#315485",
      100: "#E6ECF5",
    },
    // Electric Blue Accent
    electric: {
      600: "#2563EB", // Primary CTA & active states
      500: "#3B82F6",
      400: "#60A5FA",
      100: "#DBEAFE",
      50: "#EFF6FF",
    },
    // Surfaces
    surface: {
      bg: "#F4F7FB",      // Soft dashboard background
      card: "#FFFFFF",    // Pure white rounded card
      subtle: "#F8FAFC",  // Table header / light input bg
      border: "#E2E8F0",  // Crisp border
    },
    // Text
    text: {
      primary: "#0B1F3A",
      secondary: "#64748B",
      muted: "#94A3B8",
      inverse: "#FFFFFF",
    },
    // Status (Used ONLY for verification results & reading match fidelity)
    status: {
      match: {
        text: "#065F46",
        bg: "#D1FAE5",
        border: "#A7F3D0",
        solid: "#10B981",
        label: "Readings Match",
      },
      variation: {
        text: "#92400E",
        bg: "#FEF3C7",
        border: "#FDE68A",
        solid: "#F59E0B",
        label: "Minor Variation",
      },
      mismatch: {
        text: "#991B1B",
        bg: "#FEE2E2",
        border: "#FECACA",
        solid: "#EF4444",
        label: "Significant Mismatch",
      },
    },
    // Source Tags
    source: {
      manual: {
        text: "#1E40AF",
        bg: "#DBEAFE",
        border: "#BFDBFE",
        label: "Manual Entry",
      },
      simulated: {
        text: "#475569",
        bg: "#F1F5F9",
        border: "#CBD5E1",
        label: "Simulated Demo Data",
      },
      sensor: {
        text: "#6B21A8",
        bg: "#F3E8FF",
        border: "#E9D5FF",
        label: "Sensor (Future)",
      },
    },
  },

  radius: {
    sm: "0.375rem",   // 6px
    md: "0.5rem",     // 8px
    lg: "0.75rem",    // 12px
    xl: "1rem",       // 16px
    "2xl": "1rem",    // 16px - Standard rounded-2xl
    "3xl": "1.5rem",  // 24px - Large hero cards
    full: "9999px",
  },

  shadows: {
    soft: "0 4px 20px -2px rgba(11, 31, 58, 0.05), 0 2px 6px -1px rgba(11, 31, 58, 0.03)",
    card: "0 10px 30px -4px rgba(11, 31, 58, 0.06), 0 4px 8px -2px rgba(11, 31, 58, 0.02)",
    hover: "0 14px 34px -4px rgba(11, 31, 58, 0.10), 0 6px 12px -2px rgba(11, 31, 58, 0.04)",
  },

  typography: {
    fontSans: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif",
    sizes: {
      xs: "0.75rem",
      sm: "0.875rem",
      base: "1rem",
      lg: "1.125rem",
      xl: "1.25rem",
      "2xl": "1.5rem",
      "3xl": "1.875rem",
    },
    weights: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
      extrabold: 800,
    },
  },
} as const;

export type DesignTokens = typeof tokens;

