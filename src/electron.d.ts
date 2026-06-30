export interface ElectronAPI {
  platform: NodeJS.Platform
  setZoomFactor: (factor: number) => void
  getZoomFactor: () => number
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
