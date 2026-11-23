import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ mode }) => {
  // Vite only exposes VITE_ values, and only on import.meta.env. Server code
  // reads its secrets (Postmark, Knock) from process.env, so in development
  // put .env there too. Values already in the environment win.
  for (const [key, value] of Object.entries(loadEnv(mode, process.cwd(), ""))) {
    process.env[key] ??= value;
  }

  return {
    plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
  };
});
