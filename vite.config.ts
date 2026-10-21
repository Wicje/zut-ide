import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { spawn } from 'node:child_process'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Starting the dev or preview server also starts the local stack it needs:
// opencode serve, the file bridge, zut-host and the broker. So `npm run dev`
// (browser) and `npm run term` (terminal) both give you a working agent
// without a second command. Set ZUT_LOCAL_STACK=0 to opt out, and it stays
// off in CI.
function localStackPlugin(): Plugin {
  const start = () => {
    if (process.env.CI) return
    if (process.env.ZUT_LOCAL_STACK === '0') return
    const script = path.resolve(__dirname, 'scripts/local-stack.mjs')
    spawn(process.execPath, [script, 'up', '--quiet', '--no-vite'], {
      cwd: __dirname,
      stdio: 'inherit',
    })
  }
  return {
    name: 'zut-local-stack',
    configureServer: start,
    configurePreviewServer: start,
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    localStackPlugin(),
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
        // App shell lives at /app/index.html — / is the landing page.
        // Without this the SW would serve the landing for offline app navigations.
        navigateFallback: 'app/index.html',
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
  // Add "base": "/repo/" in the GH Pages workflow via VITE_BASE env when needed,
  // or set base here. Default (relative) works on Vercel and path-free hosts.
  base: process.env.VITE_BASE ?? '/',
  // Bind IPv4 loopback explicitly: the default "localhost" resolves to ::1
  // only, and the terminal client (and the local stack) talk to 127.0.0.1.
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1' },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    chunkSizeWarningLimit: 4000,
  },
})