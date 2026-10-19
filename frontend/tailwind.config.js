/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: v("bg"),
        surface: v("surface"),
        raised: v("raised"),
        line: v("line"),
        ink: { DEFAULT: v("ink"), 2: v("ink-2"), 3: v("ink-3") },
        accent: { DEFAULT: v("accent"), ink: v("accent-ink") },
        good: v("good"),
        warn: v("warn"),
        bad: v("bad"),
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
      borderRadius: { xl: "0.875rem" },
      fontSize: { "2xs": ["0.6875rem", "1rem"] },
    },
  },
  plugins: [],
};
