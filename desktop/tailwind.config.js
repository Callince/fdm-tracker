/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/renderer/**/*.{ts,tsx,html}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        active: "#10b981",
        idle: "#f59e0b",
        brk: "#3b82f6",
        offline: "#6b7280",
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
