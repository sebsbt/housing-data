import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": { target: "http://127.0.0.1:3001", changeOrigin: true },
      "/tiles": { target: "http://127.0.0.1:3001", changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
  /** So `vite preview` can reach the API if you run it on 3001 in another terminal. */
  preview: {
    host: "127.0.0.1",
    port: 4173,
    proxy: {
      "/api": { target: "http://127.0.0.1:3001", changeOrigin: true },
      "/tiles": { target: "http://127.0.0.1:3001", changeOrigin: true },
    },
  },
});
