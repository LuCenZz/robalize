import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api/jira-proxy': {
          target: 'https://imawebgroup.atlassian.net',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/jira-proxy/, ''),
          // Mirror the prod serverless fallback: inject server-side JIRA
          // credentials when the client sends none (lite app).
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              if (!proxyReq.getHeader('authorization') && env.JIRA_EMAIL && env.JIRA_API_TOKEN) {
                const auth = Buffer.from(`${env.JIRA_EMAIL}:${env.JIRA_API_TOKEN}`).toString('base64')
                proxyReq.setHeader('Authorization', `Basic ${auth}`)
              }
            })
          },
        },
        '/api/ai': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
  }
})
