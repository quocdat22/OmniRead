import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Proxy /api -> FastAPI: không cần CORS, SSE (EventSource) chạy cùng origin.
    proxy: { "/api": "http://127.0.0.1:8000" },
  },
  // pdf.js dùng cú pháp ES mới (top-level await...), cần target esnext.
  build: { target: "esnext" },
});
