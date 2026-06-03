import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          950: "#020720",
          900: "#06124a",
          800: "#08238c",
        },
        persona: {
          blue: "#075cff",
          royal: "#0a2fe2",
          cyan: "#55f7ff",
          ice: "#dffcff",
          ink: "#020720",
        },
      },
      fontFamily: {
        display: ["Arial Black", "Impact", "Haettenschweiler", "Arial Narrow Bold", "sans-serif"],
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        slash: "10px 12px 0 rgba(0, 0, 0, 0.28)",
        glow: "0 0 30px rgba(85, 247, 255, 0.38)",
      },
    },
  },
  plugins: [],
};

export default config;
