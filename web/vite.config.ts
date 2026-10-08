import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

const api = {
  "/api": {
    target: process.env.API_TARGET ?? "http://127.0.0.1:8000",
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/api/, ""),
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  server: { port: 5173, proxy: api },
  preview: { port: 4173, proxy: api },
  build: { chunkSizeWarningLimit: 1600 },
  test: { environment: "node" },
} as never);
