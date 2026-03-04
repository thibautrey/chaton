// src/hooks/use-log-console.ts
import { useEffect, useState } from 'react'

export function useLogConsole() {
  const [isLogConsoleOpen, setIsLogConsoleOpen] = useState(false)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ctrl+Shift+L pour ouvrir/fermer la console de logs
      if (event.ctrlKey && event.shiftKey && event.key === 'L') {
        event.preventDefault()
        setIsLogConsoleOpen(prev => !prev)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  return {
    isLogConsoleOpen,
    setIsLogConsoleOpen,
    toggleLogConsole: () => setIsLogConsoleOpen(prev => !prev)
  }
}
