// Type declarations for window.desktop API
declare global {
  interface Window {
    desktop: {
      platform: string
      isWindowFocused: () => Promise<boolean>
      showNotification: (title: string, body: string) => Promise<boolean>
    }
  }
}

export {};