import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { ViteImageOptimizer } from 'vite-plugin-image-optimizer';

export default defineConfig({
  plugins: [
    react(),
    ViteImageOptimizer({
      png: { quality: 70 },
      jpg: { quality: 75 },
      jpeg: { quality: 75 },
      webp: { quality: 75 },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        timeout: 120000,
      },
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor:        ['react', 'react-dom', 'react-router-dom', 'axios'],
          'admin-pages': [
            './src/features/admin/pages/Dashboard',
            './src/features/admin/pages/Stores',
            './src/features/admin/pages/Users',
            './src/features/admin/pages/AuditLogs',
            './src/features/admin/pages/Inventory',
            './src/features/admin/pages/Reports',
            './src/features/admin/pages/Upload',
            './src/features/admin/pages/Analytics',
            './src/features/admin/pages/Batches',
          ],
          'store-pages': [
            './src/features/store/pages/Dashboard',
            './src/features/store/pages/Inventory',
          ],
        },
      },
    },
  },
});
