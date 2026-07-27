import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  server: {
    host: "::",
    port: 8080,
    hmr: { overlay: false },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      input: {
        // Site vitrine (avisdoc.fr)
        main: path.resolve(__dirname, "index.html"),
        // Back-office (admin.avisdoc.fr)
        admin: path.resolve(__dirname, "admin.html"),
        // Espace client (client.avisdoc.fr)
        client: path.resolve(__dirname, "client.html"),
        // Espace professionnel (pro.avisdoc.fr)
        pro: path.resolve(__dirname, "pro.html"),
      },
    },
  },
});
