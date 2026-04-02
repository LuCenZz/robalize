import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/jira-proxy': {
        target: 'https://imawebgroup.atlassian.net',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/jira-proxy/, ''),
      },
      '/api/ai': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
