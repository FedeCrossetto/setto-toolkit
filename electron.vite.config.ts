import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — electron-vite v5 types require Vite 6 (BuildEnvironmentOptions) but runtime works fine with Vite 5
export default defineConfig(({ mode }) => {
  // Load .env (and .env.local) without prefix filtering so all vars are available.
  // These are never exposed to the renderer — only injected into the main process bundle.
  const env = loadEnv(mode, process.cwd(), '')

  return {
  main: {
    // Bundle Supabase + ws into main (electron-builder only ships `out/`, not node_modules).
    plugins: [externalizeDepsPlugin({ exclude: ['@supabase/supabase-js', 'ws'] })],
    define: {
      // Credentials are read from .env at build time and embedded in the binary.
      // The .env file is gitignored — they never appear in the source repository.
      __GOOGLE_CLIENT_ID__:     JSON.stringify(env.GOOGLE_CLIENT_ID     ?? ''),
      __GOOGLE_CLIENT_SECRET__: JSON.stringify(env.GOOGLE_CLIENT_SECRET ?? ''),
      // OAuth App Client IDs compiled in so end-users don't need to configure anything.
      // Create once, put in .env, build → everyone who gets the binary just clicks "Sign in".
      __GITHUB_CLIENT_ID__: JSON.stringify(env.GITHUB_CLIENT_ID ?? ''),
      __GITLAB_CLIENT_ID__: JSON.stringify(env.GITLAB_CLIENT_ID ?? ''),
      // Supabase (Gastos) — leídas desde .env en dev/build del proceso main
      'process.env.SUPABASE_URL': JSON.stringify(env.SUPABASE_URL ?? ''),
      'process.env.SUPABASE_SERVICE_ROLE_KEY': JSON.stringify(env.SUPABASE_SERVICE_ROLE_KEY ?? ''),
    },
    build: {
      lib: { entry: './electron/main.ts' },
      rollupOptions: {
        // `ws` is bundled (see exclude above), but it optionally requires these
        // native add-ons. They are not installed and `ws` falls back to pure JS,
        // so mark them external to stop Rollup from trying to resolve them.
        external: ['bufferutil', 'utf-8-validate']
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { lib: { entry: './electron/preload.ts' } }
  },
  renderer: {
    root: path.resolve(__dirname),
    base: './',
    build: {
      rollupOptions: {
        input: path.resolve(__dirname, 'index.html'),
        output: {
          manualChunks(id: string): string | undefined {
            // Separate heavy vendor libs so each is independently cached and
            // parsed — Electron's V8 can JIT each chunk incrementally.
            if (id.includes('/framer-motion/')) return 'vendor-motion'
            if (id.includes('/@codemirror/') || id.includes('/codemirror/') || id.includes('/@lezer/') || id.includes('/@replit/codemirror')) return 'vendor-codemirror'
            if (id.includes('/react-dom/')) return 'vendor-react-dom'
            if (id.includes('/react-icons/')) return 'vendor-react-icons'
            if (id.includes('node_modules/')) return 'vendor'
            return undefined
          },
        },
      }
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src')
      }
    },
    plugins: [react()]
  }
  }
})
