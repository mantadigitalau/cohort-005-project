import { defineConfig, configDefaults } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    // Dates in tests are local wall-clock times. Pin the zone so a daylight
    // saving change near a test's NOW can't shift day counts by one.
    env: { TZ: "UTC" },
    exclude: [...configDefaults.exclude],
  },
});
