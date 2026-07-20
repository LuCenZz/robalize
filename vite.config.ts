import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Same defensive stripping as api/config.ts — see the comment there.
function stripWrappingQuotes(value: string): string {
  const first = value[0]
  const last = value[value.length - 1]
  if (value.length >= 2 && (first === "'" || first === '"') && first === last) {
    return value.slice(1, -1)
  }
  return value
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [
      react(),
      // Dev-only mirror of the prod routing in vercel.json: Lite is now the
      // official app served at "/", the previous React app moved to /legacy/.
      {
        name: 'lite-rewrite',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (req.url === '/api/config') {
              // Mirrors api/config.ts, which isn't executed by plain `vite dev`.
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({
                jql: env.JIRA_DEFAULT_JQL ? stripWrappingQuotes(env.JIRA_DEFAULT_JQL) : null,
              }))
              return
            }
            if (req.url === '/' || req.url === '') req.url = '/lite/index.html'
            else if (req.url === '/legacy' || req.url === '/legacy/') req.url = '/index.html'
            else if (req.url === '/lite' || req.url === '/lite/') req.url = '/lite/index.html'
            next()
          })
        },
      },
    ],
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
