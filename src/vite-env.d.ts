/// <reference types="vite/client" />

declare global {
  interface Window {
    desktop?: {
      platform: string
    }
  }
}

export {}
