/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Frontend build + dev server. API base and WS URL come from Vite env
// (VITE_API_BASE_URL, VITE_WS_URL) — see ENVIRONMENT_CONFIGURATION.md §3.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: false,
  },
});
