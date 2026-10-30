import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath } from "node:url";

const apiTarget = process.env.FLUXO_API_URL || `http://127.0.0.1:${process.env.FLUXO_PORT || 8788}`;

export default defineConfig({
  plugins: [vue({ template: { transformAssetUrls: false } })],
  resolve: { preserveSymlinks: true },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": apiTarget,
      "/storage": apiTarget,
    },
  },
  build: {
    outDir: "../app/public/ui",
    emptyOutDir: true,
    assetsDir: "assets",
    rollupOptions: {
      input: {
        app: fileURLToPath(new URL("./index.html", import.meta.url)),
        admin: fileURLToPath(new URL("./admin.html", import.meta.url)),
        adminPrototype: fileURLToPath(new URL("./prototypes/admin.html", import.meta.url)),
        roadmapDarkPrototype: fileURLToPath(new URL("./prototypes/roadmap-dark.html", import.meta.url)),
      },
    },
  },
  base: "/ui/",
});
