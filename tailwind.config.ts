import type { Config } from "tailwindcss";

/** Used by tooling (e.g. shadcn CLI). Styles are driven by `app/globals.css` and Tailwind v4. */
export default {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
} satisfies Config;
