/** Puro (testeado en settings-mask.test.ts): qué valores de ajustes nunca viajan al renderer en claro. */

export const SECURE_SET_SENTINEL = '__CONFIGURED__'

/** Claves secretas por nombre: tokens, API keys, secretos, contraseñas (no los client_id públicos). */
export function isSecretSettingKey(key: string): boolean {
  const last = key.split('.').pop() ?? key
  if (/client_id$/i.test(last)) return false
  return /(token|secret|password|passwd|_key$|^key$|apikey|api_key|service_key)/i.test(last)
}

/** Reemplaza los valores secretos (no vacíos) por el sentinel `__CONFIGURED__`. */
export function maskSecretSettings(values: Record<string, string>, extraSecret: ReadonlySet<string> = new Set()): Record<string, string> {
  return Object.fromEntries(Object.entries(values).map(([k, v]) =>
    [k, v && (extraSecret.has(k) || isSecretSettingKey(k)) ? SECURE_SET_SENTINEL : v]))
}
