import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    target: "es2020",
    // three.js is ~600 kB minified: keep it in its own chunk so pages that lazy-load 3D never pay
    // for it up front, and a UI-only redeploy doesn't make phones download it again
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (/node_modules\/three\//.test(id)) return "three";
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return "react";
        },
      },
    },
  },
  test: { environment: "jsdom", include: ["tests/*.test.ts"] },
} as never);
