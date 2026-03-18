/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

interface MessageExpansionContextType {
  collapseAllMessages: () => void
  registerMessage: (messageId: string, collapseCallback: () => void) => void
  unregisterMessage: (messageId: string) => void
}

const MessageExpansionContext = createContext<MessageExpansionContextType | null>(null)

export function MessageExpansionProvider({ children }: { children: ReactNode }) {
  const [messageCallbacks, setMessageCallbacks] = useState<Record<string, () => void>>({})

  const collapseAllMessages = useCallback(() => {
    Object.values(messageCallbacks).forEach(callback => {
      try {
        callback()
      } catch (error) {
        console.error('Error collapsing message:', error)
      }
    })
  }, [messageCallbacks])

  const registerMessage = useCallback((messageId: string, collapseCallback: () => void) => {
    setMessageCallbacks(prev => ({
      ...prev,
      [messageId]: collapseCallback
    }))
  }, [])

  const unregisterMessage = useCallback((messageId: string) => {
    setMessageCallbacks(prev => {
      const newCallbacks = { ...prev }
      delete newCallbacks[messageId]
      return newCallbacks
    })
  }, [])

  return (
    <MessageExpansionContext.Provider value={{ 
      collapseAllMessages, 
      registerMessage, 
      unregisterMessage 
    }}>
      {children}
    </MessageExpansionContext.Provider>
  )
}

export function useMessageExpansion() {
  const context = useContext(MessageExpansionContext)
  if (!context) {
    throw new Error('useMessageExpansion must be used within a MessageExpansionProvider')
  }
  return context
}