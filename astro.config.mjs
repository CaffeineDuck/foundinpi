import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  output: "server",
  devToolbar: {
    enabled: false
  },
  integrations: [react()],
  adapter: cloudflare({
    imageService: "compile"
  }),
  vite: {
    worker: {
      format: "es"
    }
  }
});
