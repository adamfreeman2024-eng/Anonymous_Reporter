import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      screens: {
        "xs": "375px",  // small mobile
      },
    },
  },
  plugins: [],
};

export default config;
