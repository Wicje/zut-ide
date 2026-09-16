import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
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