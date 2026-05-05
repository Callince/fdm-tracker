/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/renderer/**/*.{ts,tsx,html}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Status colors hit WCAG AA (≥ 4.5:1 contrast on white backgrounds)
        // when used as text. Previous emerald-500 / amber-500 / blue-500 only
        // reached 2.0–3.7 :1 — borderline-illegible for low-vision users.
        active: "#047857",   // emerald-700 — 5.4:1 vs #fff
        idle: "#b45309",     // amber-700   — 5.0:1
        brk: "#1d4ed8",      // blue-700    — 6.0:1
        offline: "#4b5563",  // gray-600    — 7.0:1
        brand: {
          DEFAULT: "#b73e13",
          dark: "#8c2e0a",
          light: "#e08b6c",
          tint: "#fbe9e1",
        },
      },
    },
  },
  plugins: [],
};
