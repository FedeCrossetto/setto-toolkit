export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'
export type BodyType = 'none' | 'json' | 'text' | 'xml' | 'form' | 'form-data'
export type AuthType = 'none' | 'bearer' | 'basic'

export interface KeyValuePair {
  id: string
  key: string
  value: string
  enabled: boolean
}

/** A field in a multipart/form-data body */
export interface FormDataField {
  id: string
  key: string
  /** String value, or a file reference encoded as '__FILE__:<base64 content>:<filename>' */
  value: string
  enabled: boolean
  isFile: boolean
}

export interface HttpRequest {
  id: string
  collectionId: string
  name: string
  method: HttpMethod
  url: string
  headers: KeyValuePair[]
  params: KeyValuePair[]
  body: { type: BodyType; content: string; formData?: FormDataField[] }
  auth: { type: AuthType; token?: string; username?: string; password?: string }
  /** JavaScript executed before the request. Has access to pm.environment.set/get */
  preRequestScript?: string
  /** JavaScript executed after the response. Has access to pm.response and pm.environment */
  postResponseScript?: string
  createdAt: string
  updatedAt: string
}

export interface Collection {
  id: string
  name: string
  description?: string
  requests: HttpRequest[]
  createdAt: string
  updatedAt: string
}

export interface Environment {
  id: string
  name: string
  isActive: boolean
  /** Variable map: key → value. Use {{varName}} in URLs/headers/body */
  variables: Record<string, string>
  /** Keys whose values should be masked in the UI (stored as plaintext, never logged) */
  secretKeys?: string[]
}

export interface HttpResponse {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  duration: number  // ms
  size: number      // bytes
}

export interface HistoryEntry {
  id: string
  executedAt: string
  request: Pick<HttpRequest, 'method' | 'url' | 'headers' | 'params' | 'body' | 'auth'>
  response: HttpResponse
}

/** State managed locally inside the plugin — not persisted */
export interface ActiveRequest {
  /** Which saved request is loaded (null = unsaved scratch) */
  requestId: string | null
  collectionId: string | null
  method: HttpMethod
  url: string
  headers: KeyValuePair[]
  params: KeyValuePair[]
  body: { type: BodyType; content: string; formData?: FormDataField[] }
  auth: { type: AuthType; token?: string; username?: string; password?: string }
  preRequestScript?: string
  postResponseScript?: string
}
