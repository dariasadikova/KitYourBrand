import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  // SPA живёт под /app/, чтобы не конфликтовать с Jinja-роутами
  base: '/app/',

  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },

  server: {
    port: 5173,
    proxy: {
      // API запросы проксируются на FastAPI
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      // Статика (CSS, JS, img) с FastAPI
      '/static': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      // Ассеты генерации (out/)
      '/assets': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },

  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
