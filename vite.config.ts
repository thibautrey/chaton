import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Electron loads dist/index.html via file:// in packaged builds.
  // Relative base keeps asset URLs resolvable outside a web server.
  base: './',
  server: {
    watch: {
      ignored: ['**/dist-electron/**', '**/electron/extensions/builtin/**/dist/**', '**/release/**'],
    },
  },
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined
          }
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) {
            return 'vendor-react'
          }
          if (id.includes('/framer-motion/')) {
            return 'vendor-motion'
          }
          if (id.includes('/lucide-react/')) {
            return 'vendor-icons'
          }
          if (id.includes('/react-markdown/') || id.includes('/remark-gfm/') || id.includes('/react-syntax-highlighter/')) {
            return 'vendor-markdown'
          }
          if (id.includes('/i18next/') || id.includes('/react-i18next/')) {
            return 'vendor-i18n'
          }
          return 'vendor'
        },
      },
    },
  },
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(process.env.npm_package_version || '0.1.0'),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
