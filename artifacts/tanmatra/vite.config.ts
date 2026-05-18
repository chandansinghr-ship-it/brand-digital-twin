import { defineConfig } from "vite";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const rawPort = process.env.PORT || "3000";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH || "/";


export default defineConfig({
  base: basePath,
  plugins: [reactRouter(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Keep heavy visualisation libs in their own async chunk so they
          // only load on the routes that actually use them.
          if (id.includes("recharts") || id.includes("d3-")) return "charts";
          if (id.includes("leaflet")) return "maps";
          if (id.includes("framer-motion")) return "motion";
          if (id.includes("socket.io")) return "socket";
        },
      },
    },
  },
  // react-router build manages outDir internally (build/client, build/server).
  // Do not set build.outDir here — it conflicts with the reactRouter() plugin.
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
