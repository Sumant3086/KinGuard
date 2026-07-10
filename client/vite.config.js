import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        timeout: 120000, // 2 minutes for file uploads
      },
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor:       ['react', 'react-dom', 'react-router-dom', 'axios'],
          'admin-pages': [
            './src/pages/admin/Dashboard',
            './src/pages/admin/Stores',
            './src/pages/admin/Users',
            './src/pages/admin/AuditLogs',
            './src/pages/admin/Inventory',
            './src/pages/admin/Reports',
            './src/pages/admin/Upload',
            './src/pages/admin/Analytics',
            './src/pages/admin/Batches',
          ],
          'store-pages': [
            './src/pages/store/Dashboard',
            './src/pages/store/Inventory',
          ],
        },
      },
    },
  },
});
