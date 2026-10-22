/**
 * Exportar resultados de Consultas: INSERT para SQL Server y Excel (.xlsx) real,
 * armado acá mismo (zip sin compresión + SpreadsheetML), sin dependencias.
 */

const NUMERIC = /^(int|bigint|smallint|tinyint|decimal|numeric|money|smallmoney|float|real|bit)$/i

export function isNumericType(type: string | undefined): boolean {
  return NUMERIC.test(type ?? '')
}

export function sqlValue(v: string | null, type: string | undefined): string {
  if (v === null) return 'NULL'
  if (isNumericType(type) && /^-?\d+(\.\d+)?(E[+-]?\d+)?$/i.test(v)) return v
  return `N'${v.replace(/'/g, "''")}'`
}

/**
 * `INSERT INTO tabla (cols) VALUES (...)` de a 1000 filas (el máximo de SQL Server
 * por VALUES). Números sin comillas, texto como N'...', NULL tal cual.
 */
export function toInsertSql(table: string, columns: string[], rows: (string | null)[][], types: string[] = []): string {
  const name = /^[[\w.\]]+$/.test(table) && table.includes('[') ? table : table.split('.').map((p) => `[${p.replace(/]/g, ']]')}]`).join('.')
  const cols = columns.map((c) => `[${c.replace(/]/g, ']]')}]`).join(', ')
  const out: string[] = []
  for (let i = 0; i < rows.length; i += 1000) {
    const chunk = rows.slice(i, i + 1000).map((r) => `    (${r.map((v, j) => sqlValue(v, types[j])).join(', ')})`)
    out.push(`INSERT INTO ${name} (${cols})\nVALUES\n${chunk.join(',\n')};`)
  }
  return out.join('\n\n') + '\n'
}

// ── XLSX ────────────────────────────────────────────────────────────────────

const enc = new TextEncoder()

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** Zip sin compresión (STORE): suficiente para un .xlsx. */
export function zipStore(files: { name: string; data: Uint8Array }[]): Uint8Array<ArrayBuffer> {
  const chunks: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const f of files) {
    const name = enc.encode(f.name)
    const crc = crc32(f.data)
    const local = new Uint8Array(30 + name.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true)
    lv.setUint32(14, crc, true); lv.setUint32(18, f.data.length, true); lv.setUint32(22, f.data.length, true)
    lv.setUint16(26, name.length, true)
    local.set(name, 30)
    const cen = new Uint8Array(46 + name.length)
    const cv = new DataView(cen.buffer)
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true)
    cv.setUint32(16, crc, true); cv.setUint32(20, f.data.length, true); cv.setUint32(24, f.data.length, true)
    cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true)
    cen.set(name, 46)
    chunks.push(local, f.data)
    central.push(cen)
    offset += local.length + f.data.length
  }
  const cenSize = central.reduce((n, c) => n + c.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true)
  ev.setUint32(12, cenSize, true); ev.setUint32(16, offset, true)
  const all = [...chunks, ...central, end]
  const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0))
  let p = 0
  for (const c of all) { out.set(c, p); p += c.length }
  return out
}

const xml = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
  // caracteres de control que XML no admite
  // eslint-disable-next-line no-control-regex -- justamente son los que hay que sacar
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')

function colName(i: number): string {
  let s = ''
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

export interface XlsxSheet { name: string; columns: string[]; rows: (string | null)[][]; types?: string[] }

/** Libro de Excel con una hoja: encabezado en negrita, fijo y con filtros; números como números. */
export function buildXlsx(columns: string[], rows: (string | null)[][], types: string[] = [], sheetName = 'Resultado'): Uint8Array<ArrayBuffer> {
  return buildXlsxBook([{ name: sheetName, columns, rows, types }])
}

/** Libro con varias hojas (p. ej. todos los resultados de una consulta, uno por hoja). */
export function buildXlsxBook(sheets: XlsxSheet[]): Uint8Array<ArrayBuffer> {
  // Nombres de hoja: sin caracteres prohibidos, hasta 31 y sin repetir.
  const used = new Set<string>()
  const names = sheets.map((sh, k) => {
    const base = sh.name.replace(/[[\]:*?/\\]/g, ' ').slice(0, 28).trim() || `Resultado ${k + 1}`
    let n = base
    for (let i = 2; used.has(n.toLowerCase()); i++) n = `${base} (${i})`
    used.add(n.toLowerCase())
    return n
  })
  const sheetXml = (sh: XlsxSheet): string => {
    const { columns, rows } = sh
    const types = sh.types ?? []
    const last = `${colName(Math.max(columns.length - 1, 0))}${rows.length + 1}`
    const widths = columns.map((c, j) => Math.min(60, Math.max(8, c.length + 2, ...rows.slice(0, 200).map((r) => (r[j]?.length ?? 4) + 1))))
    const cell = (v: string | null, r: number, c: number, header: boolean): string => {
      const ref = `${colName(c)}${r}`
      if (v === null) return ''
      if (!header && isNumericType(types[c]) && /^-?\d+(\.\d+)?(E[+-]?\d+)?$/i.test(v)) return `<c r="${ref}"><v>${v}</v></c>`
      return `<c r="${ref}" t="inlineStr"${header ? ' s="1"' : ''}><is><t xml:space="preserve">${xml(v)}</t></is></c>`
    }
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
      + (widths.length ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '')
      + '<sheetData>'
      + `<row r="1">${columns.map((c, j) => cell(c || `Columna${j + 1}`, 1, j, true)).join('')}</row>`
      + rows.map((r, i) => `<row r="${i + 2}">${r.map((v, j) => cell(v, i + 2, j, false)).join('')}</row>`).join('')
      + '</sheetData>'
      + (columns.length ? `<autoFilter ref="A1:${last}"/>` : '')
      + '</worksheet>'
  }
  const n = sheets.length
  const range = (k: number): number[] => Array.from({ length: k }, (_, i) => i)
  const filters = sheets.map((sh, i) => (sh.columns.length
    ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${xml(names[i]!).replace(/'/g, "''")}'!$A$1:$${colName(sh.columns.length - 1)}$${sh.rows.length + 1}</definedName>`
    : '')).join('')
  const files = [
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + range(n).map((i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
      + range(n).map((i) => `<sheet name="${xml(names[i]!)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')
      + `</sheets>${filters ? `<definedNames>${filters}</definedNames>` : ''}</workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + range(n).map((i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
      + `<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEDEDF0"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>' },
    ...sheets.map((sh, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(sh) })),
  ]
  return zipStore(files.map((f) => ({ name: f.name, data: enc.encode(f.data) })))
}
