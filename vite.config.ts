import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }

          if (id.includes("leaflet") || id.includes("react-leaflet")) {
            return "map-vendor";
          }

          if (id.includes("@supabase")) {
            return "supabase-vendor";
          }

          if (id.includes("react") || id.includes("scheduler")) {
            return "react-vendor";
          }

          return "vendor";
        }
      }
    }
  },
  test: {
    environment: "node"
  }
});
