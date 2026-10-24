import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        manualChunks: {
          echarts: ["echarts"],
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          icons: ["@fluentui/react-icons"],
        },
      },
    },
  },
  server: {
    port: 5173,
    // Dev-only convenience: proxy /cgi-bin to the real device over RNDIS so
    // `npm run dev` can be used against live hardware.
    proxy: {
      "/cgi-bin": "http://192.168.225.1",
    },
  },
});
