/**
 * Genera icon.ico multi-resolución (Windows), app-icon-512.png e icon.icns (macOS)
 * desde un PNG maestro.
 *
 * Para macOS se aplica una máscara de esquinas redondeadas (radio ~22.5% del lado,
 * igual al estándar de Apple) que hace las esquinas transparentes. macOS superpone
 * su propio recorte encima, así el ícono se ve nativo en el Dock sin esquinas blancas.
 *
 * Para Windows se usa el artwork sin transparencia forzada (el .ico incluye canal alpha
 * del original pero no recorta las esquinas, que en Windows se ven bien cuadradas).
 *
 * Uso:
 *   node scripts/generate-app-icon.mjs
 *   node scripts/generate-app-icon.mjs path/to/master.png
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

// Tamaños estándar para .ico en Windows.
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]

// Tamaños requeridos por Apple para un .icns válido.
const ICNS_SIZES = [16, 32, 64, 128, 256, 512, 1024]

/**
 * Genera un buffer PNG del artwork escalado a `size`×`size` con esquinas redondeadas
 * transparentes. Radio ~29% del lado (squircle de Apple).
 *
 * Para evitar el "white fringe" (píxeles blancos semi-transparentes en el borde de la
 * máscara por antialiasing), el artwork se compone primero sobre un fondo del color
 * dominante del ícono antes de aplicar el recorte. Así el borde siempre sangra al color
 * oscuro del fondo del ícono y nunca al blanco.
 */
async function renderMacFrame(src, size, resizeOpts, pngOpts) {
  const radius = Math.round(size * 0.29)   // squircle Apple ≈ 29 %

  // 1. Escalar el artwork
  const resized = await sharp(src).resize(size, size, resizeOpts).png().toBuffer()

  // 2. Componer sobre fondo oscuro que coincide con el color de esquina del ícono.
  //    Esto elimina el fringe blanco: los píxeles semi-transparentes del borde
  //    mezclan con oscuro en lugar de con blanco.
  const darkBg = await sharp({
    create: { width: size, height: size, channels: 4, background: { r: 38, g: 38, b: 46, alpha: 255 } }
  }).composite([{ input: resized, blend: 'over' }]).png().toBuffer()

  // 3. Aplicar máscara de esquinas redondeadas
  const svgMask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
    `<rect x="0" y="0" width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="white"/>` +
    `</svg>`
  )
  return sharp(darkBg)
    .composite([{ input: svgMask, blend: 'dest-in' }])
    .png(pngOpts)
    .toBuffer()
}

async function main() {
  const inputArg = process.argv[2]
  const src = path.resolve(root, inputArg ?? 'public/logo-app-v4.png')
  const outIco    = path.join(root, 'public/icon.ico')
  const outPng512 = path.join(root, 'public/app-icon-512.png')
  const outIcns   = path.join(root, 'public/icon.icns')

  if (!fs.existsSync(src)) {
    console.error(`No existe el archivo: ${src}`)
    process.exit(1)
  }

  const meta = await sharp(src).metadata()
  console.log(`Origen: ${path.relative(root, src)} (${meta.width}×${meta.height}, ${meta.format})`)

  // Recortar padding blanco/transparente exterior para que el artwork llene el cuadrado.
  const trimmed = await sharp(src).trim({ threshold: 20 }).toBuffer()
  const trimMeta = await sharp(trimmed).metadata()
  if (trimMeta.width !== meta.width || trimMeta.height !== meta.height) {
    console.log(`  → trim: ${meta.width}×${meta.height} → ${trimMeta.width}×${trimMeta.height}`)
  }

  const resizeOpts = { kernel: sharp.kernel.lanczos3, fit: 'cover', position: 'centre' }
  const pngOpts   = { compressionLevel: 9, adaptiveFiltering: true }

  // ── Windows .ico (sin recorte de esquinas — Windows no las redondea) ──────
  const icoBuffers = await Promise.all(
    ICO_SIZES.map((size) =>
      sharp(trimmed).resize(size, size, resizeOpts).png(pngOpts).toBuffer()
    )
  )
  const ico = await pngToIco(icoBuffers)
  fs.writeFileSync(outIco, ico)
  console.log(`OK  ${path.relative(root, outIco)} (${(ico.length / 1024).toFixed(0)} KB, ${ICO_SIZES.length} tamaños)`)

  // ── PNG 512×512 con esquinas redondeadas (electron-builder / Linux / preview) ─
  const png512 = await renderMacFrame(trimmed, 512, resizeOpts, pngOpts)
  fs.writeFileSync(outPng512, png512)
  console.log(`OK  ${path.relative(root, outPng512)} (512×512, esquinas redondeadas)`)

  // ── macOS .icns via iconutil (solo disponible en macOS) ───────────────────
  if (process.platform !== 'darwin') {
    console.log('ℹ  .icns omitido (iconutil solo está en macOS — buildear en Mac para packaging)')
    return
  }

  const iconsetDir = path.join(os.tmpdir(), 'setto-icon.iconset')
  fs.mkdirSync(iconsetDir, { recursive: true })

  // iconutil necesita pares 1x + @2x. El 1024 solo existe como @2x del 512.
  await Promise.all(
    ICNS_SIZES.flatMap((size) => {
      const tasks = []
      if (size !== 1024) {
        tasks.push(
          renderMacFrame(trimmed, size, resizeOpts, pngOpts).then((buf) =>
            fs.promises.writeFile(path.join(iconsetDir, `icon_${size}x${size}.png`), buf)
          )
        )
      }
      const half = size / 2
      if (Number.isInteger(half)) {
        tasks.push(
          renderMacFrame(trimmed, size, resizeOpts, pngOpts).then((buf) =>
            fs.promises.writeFile(path.join(iconsetDir, `icon_${half}x${half}@2x.png`), buf)
          )
        )
      }
      return tasks
    })
  )

  execFileSync('iconutil', ['-c', 'icns', iconsetDir, '-o', outIcns])
  fs.rmSync(iconsetDir, { recursive: true, force: true })

  const icnsSize = fs.statSync(outIcns).size
  console.log(`OK  ${path.relative(root, outIcns)} (${(icnsSize / 1024).toFixed(0)} KB, para macOS)`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
