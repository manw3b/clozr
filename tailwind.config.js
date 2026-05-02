/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: "#E8001D",
        "brand-light": "#ff4458",
      },
    },
  },
  plugins: [],
};
