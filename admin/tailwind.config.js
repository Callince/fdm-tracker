/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
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
