import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    allowedHosts: [".app.github.dev"],
    strictPort: false,
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        configure: proxy => proxy.on("proxyReq", proxyReq => proxyReq.removeHeader("origin")),
      },
      "/socket.io": {
        target: "http://localhost:3001",
        ws: true,
        configure: proxy => {
          proxy.on("proxyReq", proxyReq => proxyReq.removeHeader("origin"));
          proxy.on("proxyReqWs", proxyReq => proxyReq.removeHeader("origin"));
        },
      },
    },
  },
});
