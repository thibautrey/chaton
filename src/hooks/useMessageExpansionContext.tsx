/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from 'react'

interface MessageExpansionContextType {
  collapseAllMessages: () => void
  registerMessage: (messageId: string, collapseCallback: () => void) => void
  unregisterMessage: (messageId: string) => void
}

const MessageExpansionContext = createContext<MessageExpansionContextType | null>(null)

export function MessageExpansionProvider({ children }: { children: ReactNode }) {
  const messageCallbacksRef = useRef(new Map<string, () => void>())

  const collapseAllMessages = useCallback(() => {
    for (const callback of messageCallbacksRef.current.values()) {
      try {
        callback()
      } catch (error) {
        console.error('Error collapsing message:', error)
      }
    }
  }, [])

  const registerMessage = useCallback((messageId: string, collapseCallback: () => void) => {
    messageCallbacksRef.current.set(messageId, collapseCallback)
  }, [])

  const unregisterMessage = useCallback((messageId: string) => {
    messageCallbacksRef.current.delete(messageId)
  }, [])

  const value = useMemo(
    () => ({
      collapseAllMessages,
      registerMessage,
      unregisterMessage,
    }),
    [collapseAllMessages, registerMessage, unregisterMessage],
  )

  return (
    <MessageExpansionContext.Provider value={value}>
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
