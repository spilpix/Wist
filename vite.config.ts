import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'

// Strict CSP for production builds only — dev needs Vite's inline/HMR scripts.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' media: data: blob:",
  "media-src 'self' media: blob:",
  "font-src 'self' data:",
  "connect-src 'self' media: blob: https://rqmfihedebhwvcrcjkkr.supabase.co wss://rqmfihedebhwvcrcjkkr.supabase.co https://*.supabase.co wss://*.supabase.co",
].join('; ')

function injectCsp(): Plugin {
  return {
    name: 'wist:inject-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`
      )
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    injectCsp(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          // Baked into the main bundle: the "Testing Bard" build (BARD_TESTING=1)
          // uses an isolated userData folder and seeds demo content on first run.
          define: { __BARD_TESTING__: JSON.stringify(process.env.BARD_TESTING === '1') },
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['better-sqlite3', 'electron-store'],
            },
          },
        },
      },
      preload: {
        input: 'electron/preload.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
          },
        },
      },
    }),
  ],
  server: { port: 5173, strictPort: true },
  build: {
    outDir: 'dist',
    // Split heavy vendors out of the main chunk so they cache independently and load in
    // parallel, instead of one ~1.2 MB monolith (the audit's scalability note #5).
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts', 'd3-force'],
          supabase: ['@supabase/supabase-js'],
          icons: ['lucide-react'],
        },
      },
    },
  },
})
