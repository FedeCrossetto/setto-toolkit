/** Texto comparable: minúsculas y sin tildes ("Fuente" = "fuénte"). */
export const normalizeSearch = (s: string): string => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/** ¿Todas las palabras de la búsqueda están en el texto? */
export function matchesAll(text: string, query: string): boolean {
  const t = normalizeSearch(text)
  return normalizeSearch(query).split(/\s+/).filter(Boolean).every((w) => t.includes(w))
}

/**
 * Ajustes → buscar: muestra sólo las filas (`[data-settings-row]`) que coinciden; si
 * coincide el título del grupo (`[data-settings-group]`), el grupo entero. Los grupos
 * sin filas, o cuyo texto coincide fuera de las filas (p. ej. Apariencia), se muestran enteros. Devuelve cuántas filas
 * (o grupos sin filas) quedan visibles. Sin búsqueda, muestra todo.
 */
export function filterSettings(root: HTMLElement, query: string): number {
  const q = query.trim()
  let hits = 0
  for (const group of Array.from(root.querySelectorAll<HTMLElement>('[data-settings-group]'))) {
    const rows = Array.from(group.querySelectorAll<HTMLElement>('[data-settings-row]'))
    if (!q) {
      group.hidden = false
      for (const r of rows) r.hidden = false
      continue
    }
    const head = group.querySelector('header')?.textContent ?? ''
    if (matchesAll(head, q)) {
      group.hidden = false
      for (const r of rows) r.hidden = false
      hits += Math.max(1, rows.length)
      continue
    }
    if (!rows.length) {
      const ok = matchesAll(group.textContent ?? '', q)
      group.hidden = !ok
      if (ok) hits++
      continue
    }
    let visible = 0
    for (const r of rows) {
      const ok = matchesAll(r.textContent ?? '', q)
      r.hidden = !ok
      if (ok) visible++
    }
    // Coincide algo del grupo que no es una fila (p. ej. el bloque de Apariencia: Mica, acento…):
    // se muestra el grupo entero.
    if (!visible && matchesAll(group.textContent ?? '', q)) {
      for (const r of rows) r.hidden = false
      group.hidden = false
      hits++
      continue
    }
    group.hidden = visible === 0
    hits += visible
  }
  return hits
}
