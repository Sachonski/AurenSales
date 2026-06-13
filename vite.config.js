import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: process.env.ONYX_BASE_URL || 'https://app.onyxcrm.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        headers: {
          Authorization: `Bearer ${process.env.ONYX_API_TOKEN || ''}`,
        },
      },
    },
  },
})
