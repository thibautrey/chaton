// Type declarations for window.desktop API
export {}

declare global {
  interface Window {
    desktop: DesktopAPI
  }
}

interface DesktopAPI {
  platform: string
  isWindowFocused: () => Promise<boolean>
  showNotification: (title: string, body: string) => Promise<boolean>
}