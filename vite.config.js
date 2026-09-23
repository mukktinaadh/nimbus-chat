import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The frontend is always served from the same origin as the API. In dev, Vite
// proxies `/api` to the Express server; in production Express serves `dist/`
// itself. Either way the browser never talks to an LLM provider directly.
export default defineConfig({
  plugins: [react()],
  // Every style here is hand-written CSS with custom properties. Setting the
  // inline PostCSS config pins that, so the build never silently picks up a
  // PostCSS/Tailwind config from a parent directory.
  css: { postcss: { plugins: [] } },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
