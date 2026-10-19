/**
 * Pegar sin pisar el portapapeles del usuario (lógica pura, testeada).
 * Antes de pegar un snippet / copiado desde el selector o la barra se guarda el
 * texto que había; después del Ctrl+V simulado se vuelve a poner, salvo que el
 * portapapeles haya cambiado mientras tanto o tuviera algo que no es texto.
 */

/** Texto a restaurar después de pegar, o null si no hay que tocar nada. */
export function restorableText(formats: string[], text: string, isPrivate: boolean): string | null {
  if (isPrivate) return null
  // Una imagen (o archivos) no se puede restaurar como texto: mejor no tocar.
  if (formats.some((f) => /^image\//i.test(f) || /^text\/uri-list$/i.test(f))) return null
  return text ? text : null
}

/** Restaurar sólo si sigue estando lo que pegamos (el usuario no copió otra cosa). */
export function shouldRestore(prev: string | null, pasted: string, current: string): prev is string {
  return prev !== null && prev !== pasted && current === pasted
}

/** Tiempo para que la app de destino lea el portapapeles antes de restaurarlo. */
export const RESTORE_DELAY_MS = 600
