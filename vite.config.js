import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: process.env.GITHUB_PAGES ? '/mArInTrAnSiT/' : '/',
  plugins: [react()],
  server: {
    port: 3000,
    open: true,
    proxy: {
      '/api': {
        target: 'http://api.511.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '/transit'),
      }
    }
  }
})
