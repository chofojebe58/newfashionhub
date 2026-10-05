import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        product: path.resolve(__dirname, 'product.html'),
        shop: path.resolve(__dirname, 'shop.html'),
        cart: path.resolve(__dirname, 'checkout.html'),
        lookbook: path.resolve(__dirname, 'lookbook.html'),
        'order-success': path.resolve(__dirname, 'order-success.html'),
        account: path.resolve(__dirname, 'account.html'),
        admin: path.resolve(__dirname, 'admin.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@features': path.resolve(__dirname, 'src/features'),
      '@components': path.resolve(__dirname, 'src/components'),
      '@utils': path.resolve(__dirname, 'src/utils'),
      '@app-types': path.resolve(__dirname, 'src/types'),
      '@api': path.resolve(__dirname, 'src/api'),
      '@styles': path.resolve(__dirname, 'src/styles'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        // Override with API_URL=... when the backend runs on another port.
        target: process.env.API_URL || 'http://localhost:3001',
        changeOrigin: true,
      },
      // Product images uploaded through the admin panel are served by Express.
      '/uploads': {
        target: process.env.API_URL || 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    globals: false,
    restoreMocks: true,
  },
});
