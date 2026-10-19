/**
 * Cambia el logo de Setto (app, ícono de Windows, sidebar, splash, Acerca de y
 * el widget/dock) a partir de UNA imagen cualquiera (jpg/png/webp).
 *
 * Uso:
 *   npm run logo:set -- "C:\ruta\a\imagen.jpg"
 *   npm run logo:set -- imagen.png --margin 0.06 --radius 0.23 --no-crop
 *
 * Qué hace:
 *   1. Detecta el color de fondo (promedio de las 4 esquinas) y encuadra el
 *      motivo en un cuadrado con margen (`--margin`, fracción del lado).
 *      Con `--no-crop` usa la imagen entera (recortada al cuadrado central).
 *   2. Aplica esquinas redondeadas (`--radius`, fracción del lado).
 *   3. Escribe:
 *        public/logo-app.png      maestro 1024 (fuente de los íconos)
 *        public/setto-logo.png    256 — sidebar, onboarding, dock/widget
 *        public/setto-logo-lg.png 336 — splash (index.html) y Acerca de
 *   4. Regenera public/icon.ico y public/app-icon-512.png (generate-app-icon.mjs).
 *
 * El ícono de la barra de tareas cambia recién al reinstalar (el acceso directo
 * instalado guarda el .ico viejo).
 */

import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

function parseArgs(argv) {
  const opts = { input: null, margin: 0.07, radius: 0.23, crop: true, threshold: 45 }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--margin') opts.margin = Number(argv[++i])
    else if (a === '--radius') opts.radius = Number(argv[++i])
    else if (a === '--threshold') opts.threshold = Number(argv[++i])
    else if (a === '--no-crop') opts.crop = false
    else if (!opts.input) opts.input = a
  }
  return opts
}

/** Color promedio de un parche de 8×8 en cada esquina. */
function cornerColor(data, w, h, ch) {
  const acc = [0, 0, 0]
  let n = 0
  for (const [cx, cy] of [[0, 0], [w - 8, 0], [0, h - 8], [w - 8, h - 8]]) {
    for (let y = cy; y < cy + 8; y++) {
      for (let x = cx; x < cx + 8; x++) {
        const i = (y * w + x) * ch
        acc[0] += data[i]; acc[1] += data[i + 1]; acc[2] += data[i + 2]; n++
      }
    }
  }
  return acc.map((v) => Math.round(v / n))
}

/** Caja del motivo: píxeles que se alejan del fondo más que `threshold`. */
function subjectBox(data, w, h, ch, bg, threshold) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * ch
      const d = Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2])
      if (d > threshold * 3) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (!opts.input) {
    console.error('Falta la imagen. Uso: npm run logo:set -- "ruta\\a\\imagen.jpg"')
    process.exit(1)
  }
  const src = path.resolve(process.cwd(), opts.input)
  if (!fs.existsSync(src)) {
    console.error(`No existe el archivo: ${src}`)
    process.exit(1)
  }

  const { data, info } = await sharp(src).flatten({ background: '#ffffff' }).removeAlpha().raw()
    .toBuffer({ resolveWithObject: true })
  const { width: w, height: h, channels: ch } = info
  const bg = cornerColor(data, w, h, ch)

  // Cuadrado a recortar (puede salirse de la imagen: se rellena con el fondo).
  let side, left, top
  const box = opts.crop ? subjectBox(data, w, h, ch, bg, opts.threshold) : null
  if (box) {
    const bw = box.x1 - box.x0 + 1
    const bh = box.y1 - box.y0 + 1
    side = Math.round(Math.max(bw, bh) * (1 + 2 * opts.margin))
    left = Math.round(box.x0 + bw / 2 - side / 2)
    top = Math.round(box.y0 + bh / 2 - side / 2)
    // Preferir quedarse dentro de la foto: rellenar con el color de las esquinas
    // deja una costura visible cuando el fondo es un degradé.
    if (side <= Math.min(w, h)) {
      left = Math.min(Math.max(left, 0), w - side)
      top = Math.min(Math.max(top, 0), h - side)
    } else {
      side = Math.min(w, h)
      left = Math.round((w - side) / 2)
      top = Math.round((h - side) / 2)
    }
  } else {
    side = Math.min(w, h)
    left = Math.round((w - side) / 2)
    top = Math.round((h - side) / 2)
  }

  // Extender con el color de fondo si el cuadrado se sale del lienzo.
  const padL = Math.max(0, -left), padT = Math.max(0, -top)
  const padR = Math.max(0, left + side - w), padB = Math.max(0, top + side - h)
  const background = { r: bg[0], g: bg[1], b: bg[2], alpha: 1 }
  // sharp aplica extract antes que extend dentro de un mismo pipeline: van separados.
  const extended = await sharp(data, { raw: { width: w, height: h, channels: ch } })
    .extend({ left: padL, top: padT, right: padR, bottom: padB, background })
    .png()
    .toBuffer()
  const square = await sharp(extended)
    .extract({ left: left + padL, top: top + padT, width: side, height: side })
    .png()
    .toBuffer()

  const MASTER = 1024
  const r = Math.round(MASTER * opts.radius)
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${MASTER}" height="${MASTER}">` +
    `<rect width="${MASTER}" height="${MASTER}" rx="${r}" ry="${r}" fill="#fff"/></svg>`
  )
  const master = await sharp(square)
    .resize(MASTER, MASTER, { kernel: sharp.kernel.lanczos3 })
    .ensureAlpha()
    .composite([{ input: mask, blend: 'dest-in' }])
    .png({ compressionLevel: 9 })
    .toBuffer()

  const out = (f) => path.join(root, 'public', f)
  fs.writeFileSync(out('logo-app.png'), master)
  for (const [file, size] of [['setto-logo.png', 256], ['setto-logo-lg.png', 336]]) {
    await sharp(master).resize(size, size, { kernel: sharp.kernel.lanczos3 }).png({ compressionLevel: 9 })
      .toFile(out(file))
  }
  console.log(`Fondo detectado rgb(${bg.join(',')}), recorte ${side}px desde (${left},${top})`)
  console.log('OK  public/logo-app.png, public/setto-logo.png, public/setto-logo-lg.png')

  execFileSync(process.execPath, [path.join(root, 'scripts/generate-app-icon.mjs'), 'public/logo-app.png'],
    { cwd: root, stdio: 'inherit' })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
