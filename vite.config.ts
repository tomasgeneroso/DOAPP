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
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        ws: true,
      },
      // Proxy para los archivos legales estáticos (PDF/TXT de public/legal).
      // Sólo los archivos: /legal/<slug> son rutas de la SPA
      // (/legal/terminos-y-condiciones, /legal/privacidad, …) y esta regla las
      // tapaba, así que en dev refrescar o abrir un link directo a cualquier
      // página legal devolvía el 404 de Express. Se distingue por extensión:
      // con extensión va al backend, sin extensión lo resuelve el router.
      '/legal': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        bypass: (req) => (/\.[a-z0-9]+$/i.test(req.url || '') ? undefined : '/index.html'),
      },
      // Proxy para Socket.io
      '/socket.io': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        ws: true,
      },
      // Proxy para archivos de uploads (avatars, portfolio, etc.)
      '/uploads': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: "dist/spa",
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // Split heavy third-party libs into their own long-cached vendor chunks.
        // NOTE: recharts is intentionally NOT listed here. Forcing it into a
        // named manual chunk made Vite modulepreload it from the entry (the
        // landing page pulled ~96 KB of charts it never uses). Left un-chunked,
        // Rollup keeps it in an async chunk loaded only by the admin/finance
        // routes that import it.
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-maps": ["leaflet", "react-leaflet"],
          "vendor-editor": ["react-quill"],
        },
      },
    },
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
