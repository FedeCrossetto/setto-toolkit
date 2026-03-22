export interface ElectronAPI {
  invoke: <T = unknown>(channel: string, ...args: unknown[]) => Promise<T>
  send: (channel: string, ...args: unknown[]) => void
  on: (channel: string, listener: (...args: unknown[]) => void) => () => void
  off: (channel: string, listener: (...args: unknown[]) => void) => void
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
