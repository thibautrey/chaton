// Type declarations for window.desktop API
export {}

declare global {
  interface Window {
    desktop: DesktopAPI
    telemetry?: {
      log: (level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: unknown) => Promise<boolean>
      crash: (payload: { message: string; stack?: string; context?: unknown }) => Promise<boolean>
    }
  }
}

interface DesktopAPI {
  platform: string
  isWindowFocused: () => Promise<boolean>
  showNotification: (title: string, body: string) => Promise<boolean>
}
