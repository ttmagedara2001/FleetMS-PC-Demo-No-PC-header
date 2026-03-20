/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#FAF5FF",
          100: "#F3E8FF",
          200: "#E9D5FF",
          300: "#D8B4FE",
          400: "#C084FC",
          500: "#A855F7",
          600: "#9333EA",
          700: "#7C3AED",
          800: "#6B21A8",
          900: "#581C87",
        },
        accent: {
          gold: "#7C3AED", // purple accent
          "gold-light": "#D8B4FE",
        },
        status: {
          normal: "#22C55E",
          warning: "#F59E0B",
          critical: "#EF4444",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        "glow-purple": "0 4px 20px rgba(107, 33, 168, 0.4)",
        "glow-gold": "0 4px 20px rgba(245,158,11,0.4)",
        "glow-red": "0 4px 20px rgba(239, 68, 68, 0.4)",
      },
      keyframes: {
        slideIn: {
          from: { opacity: "0", transform: "translateY(-10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        fadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        slideUp: {
          from: { transform: "translateY(100%)" },
          to: { transform: "translateY(0)" },
        },
      },
      animation: {
        "slide-in": "slideIn 0.2s ease",
        "fade-in": "fadeIn 0.2s ease",
        "slide-up": "slideUp 0.3s ease",
      },
    },
  },
  plugins: [],
};
