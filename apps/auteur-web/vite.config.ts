import { defineConfig } from "vite";

/**
 * The client build.
 *
 * No React plugin and no JSX runtime configuration: Bun and Vite both read the
 * `jsx` setting from `tsconfig.json`, so a second declaration here is a second
 * thing to keep in agreement.
 */
export default defineConfig({
  build: { outDir: "dist", sourcemap: true },
});
