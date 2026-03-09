import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // Generate separate JS chunks for each language
    rollupOptions: {
      output: {
        manualChunks: {
          'i18n': ['./src/i18n/index.ts'],
        },
      },
    },
  },
  // Use hash-based routing so we don't need server-side rewrites
  // This allows each language to be a separate HTML file
})
