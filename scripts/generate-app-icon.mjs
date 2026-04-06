/**
 * Genera icon.ico multi-resolución (Windows / ventana Electron) y un PNG 512×512
 * para electron-builder (mac/linux), desde un PNG maestro sin re-comprimir con pérdida.
 * Recorte tipo "cover" para que el dibujo llene el icono (mejor lectura en .exe / taskbar).
 *
 * Uso:
 *   node scripts/generate-app-icon.mjs
 *   node scripts/generate-app-icon.mjs path/to/master.png
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

// Tamaños estándar para .ico en Windows (barra de tareas, título, vistas miniatura).
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]

async function main() {
  const inputArg = process.argv[2]
  const src = path.resolve(root, inputArg ?? 'public/setto_icon.png')
  const outIco = path.join(root, 'public/icon.ico')
  const outPng512 = path.join(root, 'public/app-icon-512.png')

  if (!fs.existsSync(src)) {
    console.error(`No existe el archivo: ${src}`)
    process.exit(1)
  }

  const meta = await sharp(src).metadata()
  console.log(`Origen: ${path.relative(root, src)} (${meta.width}×${meta.height}, ${meta.format})`)

  // `contain` deja mucho margen si el PNG no es cuadrado → el icono se ve “chico” en el .exe / barra de tareas.
  // `cover` llena el cuadrado (recorta bordes si hace falta) para máxima presencia visual.
  const resizeOpts = {
    kernel: sharp.kernel.lanczos3,
    fit: 'cover',
    position: 'centre',
  }

  // PNG sin pérdida por capa dentro del ICO.
  const pngOpts = { compressionLevel: 9, adaptiveFiltering: true }

  const icoBuffers = await Promise.all(
    ICO_SIZES.map((size) =>
      sharp(src).resize(size, size, resizeOpts).png(pngOpts).toBuffer()
    )
  )

  const ico = await pngToIco(icoBuffers)
  fs.writeFileSync(outIco, ico)
  console.log(`OK  ${path.relative(root, outIco)} (${ico.length} bytes, ${ICO_SIZES.length} tamaños)`)

  await sharp(src)
    .resize(512, 512, resizeOpts)
    .png(pngOpts)
    .toFile(outPng512)
  console.log(`OK  ${path.relative(root, outPng512)} (512×512, para electron-builder)`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
