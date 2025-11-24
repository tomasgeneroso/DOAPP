import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { viteStaticCopy } from 'vite-plugin-static-copy';

// https://vitejs.dev/config/
export default defineConfig({
  envPrefix: ['VITE_', 'FACEBOOK_', 'GOOGLE_'],
  server: {
    host: "::",
    port: 5173,
    https: fs.existsSync('./ssl/key.pem') && fs.existsSync('./ssl/cert.pem')
      ? {
          key: fs.readFileSync('./ssl/key.pem'),
          cert: fs.readFileSync('./ssl/cert.pem'),
        }
      : undefined,
    proxy: {
      // Proxy para las rutas de la API
      '/api': {
        target: 'https://localhost:3001',
        changeOrigin: true,
        secure: false,
        ws: true,
      },
      // Proxy para los archivos legales
      '/legal': {
        target: 'https://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      // Proxy para Socket.io
      '/socket.io': {
        target: 'https://localhost:3001',
        changeOrigin: true,
        secure: false,
        ws: true,
      },
    },
  },
  build: {
    outDir: "dist/spa",
  },
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: 'public/firebase-messaging-sw.js',
          dest: ''
        }
      ]
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client"),
    },
  },
});
