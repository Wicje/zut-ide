import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Offline-first for cheap phones on bad networks: precache the app shell
    // (including the ~8MB esbuild-wasm binary) so cold starts don't re-download.
    // Existing public/manifest.webmanifest is kept (manifest:false).
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false,
      workbox: {
        // esbuild-wasm exceeds workbox's 2MB default — never exclude it.
        maximumFileSizeToCacheInBytes: 15_000_000,
        globPatterns: ['**/*.{js,css,html,wasm,woff,woff2,ttf,png,svg,ico}'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // React/Vue starters pull packages from esm.sh at runtime.
            urlPattern: /^https:\/\/esm\.sh\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'esm-cdn',
              expiration: { maxEntries: 50, maxAgeSeconds: 30 * 24 * 3600 },
            },
          },
        ],
      },
    }),
  ],
  // GitHub Pages serves from /<repo>/; Vercel and other hosts serve from root.
  // Add "base": "/repo-name/" in the GH Pages workflow via VITE_BASE env when needed,
  // or set base here. Default (relative) works on Vercel and path-free hosts.
  base: process.env.VITE_BASE ?? '/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    chunkSizeWarningLimit: 4000,
  },
})