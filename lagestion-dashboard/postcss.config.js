import { fileURLToPath } from "node:url";

// Chemin absolu : la config Tailwind est trouvée quel que soit le dossier de lancement.
export default {
  plugins: {
    tailwindcss: { config: fileURLToPath(new URL("./tailwind.config.js", import.meta.url)) },
    autoprefixer: {},
  },
};
