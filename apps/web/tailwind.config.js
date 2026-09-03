/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Charter §7.4: "CSS custom properties injected from the resolved
      // theme at runtime." These map Tailwind utility names to variables
      // layout.tsx sets on <html> from BrandingService's response — no
      // per-partner CSS build, no compiled variant (see layout.tsx).
      colors: {
        brand: {
          DEFAULT: 'var(--brand-primary)',
        },
      },
    },
  },
  plugins: [],
};
