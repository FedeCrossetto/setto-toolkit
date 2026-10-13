import { BrowserWindow, nativeImage, nativeTheme } from 'electron'
import path from 'path'

/**
 * Ventanita de carga que aparece apenas se abre la app (antes de que exista la
 * ventana principal): ícono, "Abriendo Setto…" y una barrita animada, centrada
 * en la pantalla. Se cierra cuando la ventana principal está lista para mostrarse.
 * HTML inline (data: URL): no depende del renderer ni de la red.
 */

let splash: BrowserWindow | null = null
let shownAt = 0
const SIZE = { width: 240, height: 220 }

function iconDataUrl(): string {
  // En el build el PNG está dentro del asar (out/renderer); nativeImage lo lee igual.
  const img = nativeImage.createFromPath(path.join(__dirname, '../renderer/app-icon-512.png'))
  return img.isEmpty() ? '' : img.resize({ width: 128, quality: 'best' }).toDataURL()
}

function html(icon: string, dark: boolean): string {
  const bg = dark ? 'rgba(32,32,35,0.96)' : 'rgba(255,255,255,0.97)'
  const fg = dark ? '#F4F4F5' : '#1C1C1E'
  const border = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;height:100%;background:transparent;overflow:hidden;font-family:"Segoe UI Variable Text","Segoe UI",system-ui,sans-serif;-webkit-user-select:none;cursor:default}
    .card{position:absolute;inset:12px;border-radius:22px;background:${bg};border:1px solid ${border};
      box-shadow:0 18px 50px -12px rgba(0,0,0,.35);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;
      animation:in .28s cubic-bezier(.34,1.2,.64,1) both;-webkit-app-region:drag}
    img{width:72px;height:72px;border-radius:18px;box-shadow:0 10px 28px -8px rgba(124,58,237,.5);animation:pulse 1.6s ease-in-out infinite}
    .t{color:${fg};font-size:13px;font-weight:600;letter-spacing:.01em;opacity:.85}
    .bar{width:96px;height:3px;border-radius:3px;background:rgba(127,127,127,.2);overflow:hidden}
    .bar::after{content:"";display:block;width:40%;height:100%;border-radius:3px;background:linear-gradient(90deg,#C9A7FF,#A855F7,#7C3AED);animation:load 1.05s ease-in-out infinite}
    @keyframes in{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:none}}
    @keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.04)}}
    @keyframes load{0%{transform:translateX(-100%)}100%{transform:translateX(260%)}}
    @media (prefers-reduced-motion: reduce){*{animation:none!important}}
  </style></head><body><div class="card">
    ${icon ? `<img src="${icon}" alt="">` : ''}
    <div class="t">Abriendo Setto…</div>
    <div class="bar"></div>
  </div></body></html>`
}

/** Mostrar ya (llamar al principio de app.whenReady). */
export function showStartupSplash(icon: Electron.NativeImage | string): void {
  if (splash) return
  splash = new BrowserWindow({
    ...SIZE,
    center: true,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: false,          // que se vea en la barra de tareas que la app está abriendo
    alwaysOnTop: false,
    show: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    icon,
    title: 'Setto',
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: false },
  })
  splash.once('ready-to-show', () => { shownAt = Date.now(); splash?.show() })
  splash.on('closed', () => { splash = null })
  void splash.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html(iconDataUrl(), nativeTheme.shouldUseDarkColors))}`)
}

/** Cerrar cuando la ventana principal se muestra (sin parpadeo si apenas apareció). */
export function closeStartupSplash(): void {
  const s = splash
  if (!s || s.isDestroyed()) return
  // Si llegó a verse, que se vea al menos un instante; si no, cerrar directo.
  const wait = shownAt ? Math.max(0, 250 - (Date.now() - shownAt)) : 0
  setTimeout(() => { if (!s.isDestroyed()) s.destroy() }, wait)
}
