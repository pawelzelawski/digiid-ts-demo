import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Proxy /api requests to the backend server (running on port 3000 now)
      '/api': {
        target: 'http://localhost:3000', // Adjust to match backend PORT from .env
        changeOrigin: true, // Recommended for virtual hosted sites
        secure: false, // Don't verify SSL certs if backend uses self-signed cert in dev
      },
    },
  },
}); 