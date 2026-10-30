import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:3001',
    },
  },
  build: {
    // The on-demand 3D library chunk is intentionally large; it is lazy-loaded
    // only when a user opens the 3D generator, so it never blocks first paint.
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!/node_modules/.test(id)) return undefined
          if (/node_modules[\\/](@react-three|three|drei|troika)/.test(id)) return 'three'
          if (/node_modules[\\/]@monaco-editor/.test(id)) return 'monaco'
          if (/node_modules[\\/](react|react-dom|scheduler|react-reconciler)[\\/]/.test(id)) return 'react-vendor'
          return 'vendor'
        },
      },
    },
  },
})
