/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: v("bg"),
        surface: v("surface"),
        raised: v("raised"),
        line: v("line"),
        fill: v("fill"),
        chrome: v("chrome"),
        ink: { DEFAULT: v("ink"), 2: v("ink-2"), 3: v("ink-3") },
        accent: { DEFAULT: v("accent"), ink: v("accent-ink") },
        good: v("good"),
        warn: v("warn"),
        bad: v("bad"),
        demo: v("demo"),
      },
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", "SF Pro Text", "Inter Variable", "Inter", "system-ui", "Segoe UI", "sans-serif"],
        display: ["-apple-system", "BlinkMacSystemFont", "SF Pro Display", "Inter Variable", "Inter", "system-ui", "sans-serif"],
      },
      borderRadius: { xl: "0.875rem", "2xl": "1.125rem" },
      fontSize: { "2xs": ["0.6875rem", "1rem"] },
    },
  },
  plugins: [],
};
