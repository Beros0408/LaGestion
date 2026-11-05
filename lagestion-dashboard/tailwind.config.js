import { C, OMBRE } from "./src/theme.js";

/** @type {import('tailwindcss').Config} */
export default {
  // relative : chemins résolus depuis ce fichier, et non depuis le dossier de lancement.
  content: { relative: true, files: ["./index.html", "./src/**/*.{js,jsx}"] },
  theme: {
    extend: {
      colors: {
        lg: {
          main: C.bgMain,
          card: C.bgCard,
          hover: C.bgHover,
          border: C.border,
          "primary-200": C.primary200,
          "primary-400": C.primary400,
          "sidebar-hover": C.sidebarHover,
          "sidebar-focus": C.sidebarFocus,
          "sidebar-bg": C.sidebarBg,
        },
      },
      boxShadow: {
        "lg-sm": OMBRE.sm,
        "lg-md": OMBRE.md,
      },
    },
  },
  plugins: [],
};
