import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// NOTE: This config has not been executed in the delivery environment
// (no network access to run `npm install` / `vite build`). Verify locally
// with: npm install && npm run build
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'Eggpreneur — Ambala Restaurant Command Center',
        short_name: 'Eggpreneur',
        description: 'Evidence-driven business operating system for launching an egg-special restaurant in Ambala, Haryana.',
        theme_color: '#b4530a',
        background_color: '#fff7ed',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        // Cache the app shell; data requests to Supabase are NOT cached here —
        // offline writes are handled by the queued-write store in src/lib/offlineQueue.ts
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        navigateFallback: '/index.html'
      }
    })
  ],
  server: { port: 5173 },
  build: { sourcemap: true }
});
