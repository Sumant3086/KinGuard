import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { ViteImageOptimizer } from 'vite-plugin-image-optimizer';

export default defineConfig({
  plugins: [
    react(),
    ViteImageOptimizer({
      // Background photos are shown behind blur(3px) — aggressive compression is invisible
      png: { quality: 55 },
      jpg: { quality: 70 },
      jpeg: { quality: 70 },
      webp: { quality: 70 },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        timeout: 120000,
        configure(proxy) {
          proxy.on('error', (err, _req, res) => {
            if (err.code === 'ECONNREFUSED') {
              // Server not ready yet — return 503 so the client handles it gracefully
              if (res.writeHead) {
                res.writeHead(503, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Server starting up…' }));
              }
            }
          });
        },
      },
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // Only the core runtime is grouped by hand. Every page in App.jsx is already
        // behind React.lazy, so Rollup emits one chunk per route on its own and lifts
        // whatever two routes share — the layout, the API client, the shared UI — into
        // a common chunk it loads alongside.
        //
        // There used to be an `admin-pages` group listing all ten admin pages, and
        // grouping them undid the lazy loading it looked like it was helping: opening
        // the dashboard downloaded the user management screen, the analytics screen and
        // everything else, 234 kB of it, to render four cards. The same applied to the
        // store and area manager groups on a smaller scale.
        manualChunks: {
          // Downloaded by every user on first visit, and unchanged between deploys that
          // do not touch dependencies — worth pinning so it stays cached.
          vendor: ['react', 'react-dom', 'react-router-dom', 'axios'],
        },
      },
    },
  },
});
