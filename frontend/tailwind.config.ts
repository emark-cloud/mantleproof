import type { Config } from "tailwindcss";

// Encodes docs/design.md §3–§5. CSS variables live in src/styles/globals.css;
// this maps them to Tailwind utilities. No light mode (design.md §12).
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "var(--bg-canvas)",
        panel: "var(--bg-panel)",
        "panel-hi": "var(--bg-panel-hi)",
        input: "var(--bg-input)",
        "border-faint": "var(--border-faint)",
        "border-strong": "var(--border-strong)",
        "text-primary": "var(--text-primary)",
        "text-secondary": "var(--text-secondary)",
        "text-muted": "var(--text-muted)",
        "text-disabled": "var(--text-disabled)",
        accent: "var(--accent)",
        "accent-dim": "var(--accent-dim)",
        "sev-high": "var(--sev-high)",
        "sev-medium": "var(--sev-medium)",
        "sev-low": "var(--sev-low)",
        "sev-info": "var(--sev-info)",
        "sev-clean": "var(--sev-clean)",
      },
      fontFamily: {
        mono: "var(--font-mono)",
        sans: "var(--font-sans)",
      },
      fontSize: {
        xs: "11px",
        sm: "13px",
        base: "14px",
        md: "16px",
        lg: "20px",
        xl: "28px",
        xxl: "44px",
      },
    },
  },
  plugins: [],
} satisfies Config;
