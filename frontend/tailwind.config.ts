import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#0f1419",
          elevated: "#1a2332",
          border: "#2d3a4f",
        },
        accent: {
          DEFAULT: "#3b82f6",
          muted: "#1e3a5f",
        },
      },
    },
  },
  plugins: [],
};

export default config;
