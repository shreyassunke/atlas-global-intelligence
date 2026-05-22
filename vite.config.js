import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import cesium from 'vite-plugin-cesium'
import atlasApiDevPlugin from './vite-plugin-atlas-api.js'

export default defineConfig({
  plugins: [react(), tailwindcss(), cesium(), atlasApiDevPlugin()],

  // Proxy remaining `/api/*` to `vercel dev` when running (`npm run dev:api`).
  // Tactical-layer proxies (OpenSky, CelesTrak, AISStream) are handled by
  // vite-plugin-atlas-api.js with retries, caching, and server-only keys.
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_ATLAS_API_BASE || 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
    },
  },

  // Pre-bundle heavy deps for faster dev server cold start
  optimizeDeps: {
    include: ['three', 'react', 'react-dom', 'framer-motion', 'zustand'],
  },

  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // Split large dependencies into separate chunks for better caching
        // (cesium is handled externally by vite-plugin-cesium)
        manualChunks: {
          three: ['three'],
          vendor: ['react', 'react-dom', 'framer-motion', 'zustand'],
        },
      },
    },
  },
})
