import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import type { Plugin } from 'vite'
import { stripPhosphorWeights } from './src/core/icons/phosphor-weights'

/**
 * Cada ícono de Phosphor trae sus 6 pesos en el mismo módulo; la app usa 4. Borrar
 * los otros (thin, duotone) baja el chunk de íconos ~40 % (ver phosphor-weights.ts).
 */
function phosphorWeights(): Plugin {
  return {
    name: 'setto-phosphor-weights',
    enforce: 'pre',
    transform(code, id) {
      if (!/[\\/]@phosphor-icons[\\/]react[\\/]dist[\\/]defs[\\/][^\\/]+\.es\.js$/.test(id.split('?')[0] ?? '')) return null
      return { code: stripPhosphorWeights(code), map: null }
    },
  }
}

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — electron-vite v5 types require Vite 6 (BuildEnvironmentOptions) but runtime works fine with Vite 5
export default defineConfig(({ mode }) => {
  // Load .env (and .env.local) without prefix filtering. Only the public OAuth ids below
  // are injected (main process only); everything else in .env stays out of the build.
  const env = loadEnv(mode, process.cwd(), '')

  return {
  main: {
    // Only `dependencies` stay external (shipped in node_modules): chokidar, electron-updater,
    // node-pty. Everything else (Supabase, ws, React, CodeMirror…) is a devDependency and gets
    // bundled — that keeps the installer small. A new runtime require in main must either be
    // bundled (devDependency) or listed in `dependencies`.
    plugins: [externalizeDepsPlugin({ exclude: ['@supabase/supabase-js', 'ws'] })],
    // ⚠ Todo lo que se define acá queda en texto plano dentro de out/main/main.js y del
    // instalador (el repo es público). Sólo identificadores públicos: NUNCA claves de
    // servicio (la Service Role Key de Supabase da acceso total a la base). Supabase se
    // configura por usuario en Conexiones → Supabase (cifrado con safeStorage).
    define: {
      // OAuth "installed app" de Google: el client secret de un cliente de escritorio
      // NO es confidencial (Google lo documenta así: cualquiera puede extraerlo del
      // binario) y su endpoint de token lo exige aunque se use PKCE. Se embebe a propósito.
      __GOOGLE_CLIENT_ID__:     JSON.stringify(env.GOOGLE_CLIENT_ID     ?? ''),
      __GOOGLE_CLIENT_SECRET__: JSON.stringify(env.GOOGLE_CLIENT_SECRET ?? ''),
      // OAuth App Client IDs compiled in so end-users don't need to configure anything.
      // Create once, put in .env, build → everyone who gets the binary just clicks "Sign in".
      __GITHUB_CLIENT_ID__: JSON.stringify(env.GITHUB_CLIENT_ID ?? ''),
      __GITLAB_CLIENT_ID__: JSON.stringify(env.GITLAB_CLIENT_ID ?? ''),
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
    // El root es todo el proyecto: sin esto Vite vigila `release/` y en Windows una
    // carpeta vigilada no se puede renombrar (electron-builder falla con EPERM con `npm run dev` abierto).
    server: { watch: { ignored: ['**/release/**', '**/out/**', '**/dist/**', '**/test-results/**'] } },
    base: './',
    build: {
      rollupOptions: {
        input: path.resolve(__dirname, 'index.html'),
        output: {
          manualChunks(id: string): string | undefined {
            // Separate heavy vendor libs so each is independently cached and
            // parsed — Electron's V8 can JIT each chunk incrementally.
            // framer-motion delega casi todo en motion-dom / motion-utils (~215 KB): van juntos.
            if (id.includes('/framer-motion/') || id.includes('/motion-dom/') || id.includes('/motion-utils/')) return 'vendor-motion'
            if (id.includes('/@codemirror/') || id.includes('/codemirror/') || id.includes('/@lezer/') || id.includes('/@replit/codemirror')) return 'vendor-codemirror'
            if (id.includes('/react-dom/') || id.includes('/node_modules/react/') || id.includes('/node_modules/scheduler/')) return 'vendor-react-dom'
            if (id.includes('/react-icons/')) return 'vendor-react-icons'
            // Aparte para que la barra flotante y el selector no los carguen.
            if (id.includes('/@xterm/') || id.includes('/xterm')) return 'vendor-xterm'
            if (id.includes('/@phosphor-icons/')) return 'vendor-icons'
            // Sin un chunk "vendor" común: juntaba marked, dompurify, fuse.js, diff… y como
            // también tenía React se cargaba al arrancar. Rollup los deja con quien los usa.
            return undefined
          },
        },
      }
    },
    resolve: {
      alias: {
        // Íconos: los imports de 'lucide-react' se sirven con Phosphor (ver src/core/icons/lucide-shim.tsx)
        'lucide-react': path.resolve(__dirname, './src/core/icons/lucide-shim.tsx'),
        '@': path.resolve(__dirname, './src')
      }
    },
    plugins: [phosphorWeights(), react()]
  }
  }
})
