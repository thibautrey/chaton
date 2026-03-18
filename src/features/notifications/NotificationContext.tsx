/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import type { ReactNode } from 'react'

export type NotificationLink = {
  type: 'deeplink' | 'url'
  href: string
  label?: string
}

export type Notification = {
  id: string
  message: string
  type: 'info' | 'success' | 'warning' | 'error'
  createdAt: number
  timeout?: number
  link?: NotificationLink
}

export type NotificationContextType = {
  notifications: Notification[]
  allNotifications: Notification[]
  addNotification: (message: string, type?: 'info' | 'success' | 'warning' | 'error', timeout?: number, link?: NotificationLink) => void
  removeNotification: (id: string) => void
  clearNotifications: () => void
  clearAllNotifications: () => void
}

export const NotificationContext = createContext<NotificationContextType | undefined>(undefined)

const STORAGE_KEY = 'chatons_notifications_history'
const MAX_STORED_NOTIFICATIONS = 100

function loadNotificationsFromStorage(): Notification[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      // Filtre les notifications expirées (plus de 24h)
      const oneDayMs = 24 * 60 * 60 * 1000
      const now = Date.now()
      return parsed.filter((n: Notification) => now - n.createdAt < oneDayMs)
    }
  } catch (error) {
    console.error('Failed to load notifications from storage:', error)
  }
  return []
}

function saveNotificationsToStorage(notifications: Notification[]): void {
  try {
    // Garde seulement les N dernières notifications
    const toStore = notifications.slice(-MAX_STORED_NOTIFICATIONS)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore))
  } catch (error) {
    console.error('Failed to save notifications to storage:', error)
  }
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [allNotifications, setAllNotifications] = useState<Notification[]>([])
  const [isInitialized, setIsInitialized] = useState(false)

  // Charger depuis localStorage au montage
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const stored = loadNotificationsFromStorage()
    setAllNotifications(stored)
    setIsInitialized(true)
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Sauvegarder quand allNotifications change
  useEffect(() => {
    if (isInitialized) {
      saveNotificationsToStorage(allNotifications)
    }
  }, [allNotifications, isInitialized])

  const addNotification = useCallback(
    (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info', timeout: number = 5000, link?: NotificationLink) => {
      const id = Date.now().toString()
      const newNotification = { id, message, type, createdAt: Date.now(), timeout, link }

      // Ajouter aux notifications actives
      setNotifications((prev) => [...prev, newNotification])

      // Ajouter à l'historique
      setAllNotifications((prev) => [...prev, newNotification])

      // Auto-remove après timeout
      if (timeout > 0) {
        setTimeout(() => {
          setNotifications((prev) => prev.filter((n) => n.id !== id))
        }, timeout)
      }
    },
    []
  )

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
    setAllNotifications((prev) => prev.filter((n) => n.id !== id))
  }, [])

  const clearNotifications = useCallback(() => {
    setNotifications([])
  }, [])

  const clearAllNotifications = useCallback(() => {
    setAllNotifications([])
    setNotifications([])
    localStorage.removeItem(STORAGE_KEY)
  }, [])

  return (
    <NotificationContext.Provider
      value={{ notifications, allNotifications, addNotification, removeNotification, clearNotifications, clearAllNotifications }}
    >
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  const context = useContext(NotificationContext)
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider')
  }
  return context
}
