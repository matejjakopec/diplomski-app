import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    hmr: { protocol: 'ws', host: 'diplomski-app.ddev.site', port: 5173 },
    // proxy so /k6 goes to Symfony backend:
    proxy: {
      '/k6': {
        target: 'https://diplomski-app.ddev.site',
        changeOrigin: true,
        secure: false, // allow DDEV cert on backend
      },
    },
  },
})
