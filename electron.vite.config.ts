import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
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
})
