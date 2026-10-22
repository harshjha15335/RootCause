import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    target: "es2020",
    chunkSizeWarningLimit: 1200, // the 3D stage chunk; it is lazy-loaded behind a 2D pitch
  },
  test: { environment: "jsdom", include: ["tests/*.test.ts"] },
} as never);
