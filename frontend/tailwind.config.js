/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["'Instrument Serif'", "Georgia", "serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
      colors: {
        navy: {
          50: "#f1f4f9", 100: "#e1e7f1", 200: "#c4cfe2", 300: "#97a9c9", 400: "#6680ab",
          500: "#456190", 600: "#344b74", 700: "#2a3c5e", 800: "#1b2944", 900: "#111c33", 950: "#0a1224",
        },
        canvas: "#f7f6f2",
        ink: "#0f172a",
        covered: { DEFAULT: "#16a34a", soft: "#dcfce7", ink: "#14532d" },
        gap: { DEFAULT: "#dc2626", soft: "#fee2e2", ink: "#7f1d1d" },
        warn: { DEFAULT: "#d97706", soft: "#fef3c7", ink: "#78350f" },
      },
      boxShadow: {
        card: "0 1px 2px rgba(15,23,42,0.04), 0 4px 16px -6px rgba(15,23,42,0.08)",
        lift: "0 2px 4px rgba(15,23,42,0.05), 0 16px 40px -12px rgba(15,23,42,0.18)",
      },
      borderRadius: { xl: "14px", "2xl": "20px" },
      keyframes: {
        pulsering: { "0%": { boxShadow: "0 0 0 0 rgba(22,163,74,0.55)" }, "100%": { boxShadow: "0 0 0 14px rgba(22,163,74,0)" } },
      },
      animation: { pulsering: "pulsering 1.6s ease-out 3" },
    },
  },
  plugins: [],
};
