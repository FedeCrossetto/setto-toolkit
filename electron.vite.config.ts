import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  // Load .env (and .env.local) without prefix filtering so all vars are available.
  // These are never exposed to the renderer — only injected into the main process bundle.
  const env = loadEnv(mode, process.cwd(), '')

  return {
  main: {
    plugins: [externalizeDepsPlugin()],
    define: {
      // Credentials are read from .env at build time and embedded in the binary.
      // The .env file is gitignored — they never appear in the source repository.
      __GOOGLE_CLIENT_ID__:     JSON.stringify(env.GOOGLE_CLIENT_ID     ?? ''),
      __GOOGLE_CLIENT_SECRET__: JSON.stringify(env.GOOGLE_CLIENT_SECRET ?? ''),
      // OAuth App Client IDs compiled in so end-users don't need to configure anything.
      // Create once, put in .env, build → everyone who gets the binary just clicks "Sign in".
      __GITHUB_CLIENT_ID__: JSON.stringify(env.GITHUB_CLIENT_ID ?? ''),
      __GITLAB_CLIENT_ID__: JSON.stringify(env.GITLAB_CLIENT_ID ?? ''),
    },
    build: {
      lib: {
        entry: './electron/main.ts'
      },
      rollupOptions: {}
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: './electron/preload.ts'
      }
    }
  },
  renderer: {
    root: path.resolve(__dirname),
    base: './',
    build: {
      rollupOptions: {
        input: path.resolve(__dirname, 'index.html')
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
