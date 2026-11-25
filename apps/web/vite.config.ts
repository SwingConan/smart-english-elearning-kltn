import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'src/features/placement/integration.test.tsx',
      'src/features/product/product.test.tsx',
      'src/features/instructor/m07-instructor-workspace.test.tsx',
      'src/features/admissions/admissions.test.tsx',
      'src/features/class-lms/quiz.test.tsx',
      'src/layouts/learner-shell-policy.test.tsx',
      'src/features/class-lms/consolidated.test.tsx',
      'src/layouts/mobile-navigation.test.tsx',
      'src/features/presentation/copy-regression.test.tsx',
      'src/features/class-lms/quiz-attendance-local.test.tsx',
      'src/features/class-lms/grading.test.tsx',
      'src/features/academic/roadmap-setup.test.tsx',
      'src/features/knowledge/knowledge.test.tsx',
      'src/features/placement/workflow.test.tsx',
      'src/features/learner/student-dashboard.test.tsx',
      'src/features/m02/m02-product.test.tsx',
      'src/features/academic/planning.test.tsx',
      'src/features/enrollments/enrollment.test.tsx',
      'src/features/workspace/workspace.test.tsx',
      'src/features/operations/visual-qa/guard-core.test.mjs',
    ],
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
