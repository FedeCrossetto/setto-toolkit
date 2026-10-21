/* global localStorage, matchMedia, document */
// Tema (claro/oscuro) antes de pintar, para que la pantalla de apertura no parpadee.
// Archivo aparte (no inline): la CSP de main sólo permite scripts propios ('self').
try {
  var m = localStorage.getItem('app-theme-mode'), t = localStorage.getItem('app-theme')
  var dark = m === 'system' ? matchMedia('(prefers-color-scheme: dark)').matches : (t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
} catch { /* sin localStorage: tema por defecto */ }
