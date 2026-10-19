/** Sección "## <versión> …" del CHANGELOG (sin el título), o '' si no está. */
export function changelogSection(changelog: string, version: string): string {
  const lines = changelog.split(/\r?\n/)
  const start = lines.findIndex((l) => l.startsWith('## ') && l.slice(3).trim().split(/\s/)[0] === version)
  if (start < 0) return ''
  let end = lines.findIndex((l, i) => i > start && l.startsWith('## '))
  if (end < 0) end = lines.length
  return lines.slice(start + 1, end).join('\n').trim()
}
