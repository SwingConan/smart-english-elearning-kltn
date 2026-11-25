import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api/v2/placement/config': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/api/v2/placement/workflow': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/api/v2/placement/history': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/api/v2/support': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/api/v2/consultations': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/api/v2/my/events/': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/api/v2/my/finance': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/api/v2/lms-local': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
  preview: { host: '127.0.0.1', port: 5173, strictPort: true },
});
