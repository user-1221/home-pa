import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vitest/config";

import { env } from "./src/lib/server/env.ts";

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  server: {
    port: Number(env.PORT),
  },
  test: {
    globals: true,
    environment: "node",
    include: ["**/*.{test,spec}.{js,ts}"],
    exclude: ["node_modules", "build", ".svelte-kit"],
    setupFiles: ["src/lib/test/vitest-setup.ts"],
  },
});
