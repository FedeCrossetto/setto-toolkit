/** Replace {{varName}} tokens in a string using the active environment */
export function interpolate(str: string, vars: Record<string, string>): string {
  return str.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k as string] ?? `{{${k as string}}}`)
}

/** Strip CR/LF characters from a header name or value to prevent HTTP header injection */
export function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n]/g, '')
}

const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^0\.0\.0\.0$/,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
]

/** Throws if the hostname is a private/loopback address (SSRF guard). */
export function assertNotPrivateHost(urlObj: URL): void {
  const host = urlObj.hostname.toLowerCase()
  if (host === 'localhost') throw new Error('SSRF: requests to localhost are not allowed')
  if (PRIVATE_IP_PATTERNS.some((re) => re.test(host))) {
    throw new Error(`SSRF: requests to private/internal addresses are not allowed (${host})`)
  }
}

/** Returns true if the given resolved IP is a private/loopback address. */
export function isPrivateAddress(address: string): boolean {
  return PRIVATE_IP_PATTERNS.some((re) => re.test(address))
}
