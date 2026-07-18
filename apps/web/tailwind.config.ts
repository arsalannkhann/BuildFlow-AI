import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { 100: "#DCEAF2", 700: "#1F4E6D", 900: "#102A43" },
        accent: { 100: "#FCE8D5", 600: "#C65D16" },
        success: { 100: "#DDF3E8", 700: "#16794B" },
        warning: { 100: "#FFF2C6", 700: "#996A00" },
        danger: { 100: "#FEE4E2", 700: "#B42318" },
      },
      borderRadius: { card: "12px", control: "10px" },
    },
  },
  plugins: [],
};
export default config;
