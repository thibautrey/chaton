import { type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from 'react'
import type { SyntheticEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Sidebar } from '@/components/sidebar/Sidebar'
import { BackgroundChannelExtensions } from '@/components/extensions/BackgroundChannelExtensions'
import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow'
import { AssistantMainView } from '@/components/assistant/AssistantMainView'
import { Composer } from '@/components/shell/Composer'
import { MainView } from '@/components/shell/MainView'
import { Topbar } from '@/components/shell/Topbar'
import { ChangelogManager, setChangelogManagerRef } from '@/components/ChangelogManager'
import type { ChangelogManagerHandle } from '@/components/ChangelogManager'
import { LogConsole } from '@/components/LogConsole'
import { TelemetryConsentCard } from '@/components/TelemetryConsentCard'
import { PiSettingsProvider } from '@/features/workspace/pi-settings-store'
import { WorkspaceProvider } from '@/features/workspace/store'
import { useWorkspace } from '@/features/workspace/store'
import { useLogConsole } from '@/hooks/use-log-console'
import { ConversationSidePanelProvider } from '@/hooks/use-conversation-side-panel'
import { NotificationProvider } from '@/features/notifications/NotificationContext'
import heroCat from '@/assets/chaton-hero.webm'

const SIDEBAR_MIN_WIDTH = 260
const SIDEBAR_MAX_WIDTH = 460
const SIDEBAR_DEFAULT_WIDTH = 320
const SIDEBAR_RESIZE_STEP = 16

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

const LOADING_MESSAGES = [
  'Warming up the purr-ocessor.',
  'Teaching the cat to type without walking on the keyboard.',
  'Fetching high-priority snacks from cache.',
  'Aligning whiskers with your workspace.',
] as const

function LoadingSplash() {
  const [messageIndex, setMessageIndex] = useState(0)
  const [videoHidden, setVideoHidden] = useState(false)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setMessageIndex((current) => (current + 1) % LOADING_MESSAGES.length)
    }, 6500)
    return () => window.clearInterval(timer)
  }, [])

  const handleVideoError = useCallback((event: SyntheticEvent<HTMLVideoElement>) => {
    const mediaError = event.currentTarget.error
    console.error('Loading splash video failed to load', {
      code: mediaError?.code,
      message: mediaError?.message,
      currentSrc: event.currentTarget.currentSrc,
      networkState: event.currentTarget.networkState,
      readyState: event.currentTarget.readyState,
    })
    setVideoHidden(true)
  }, [])

  return (
    <div className="loading-splash">
      <div className="loading-splash-animation">
        {!videoHidden ? (
          <video autoPlay loop muted playsInline className="loading-splash-video" onError={handleVideoError}>
            <source src={heroCat} type="video/webm" />
          </video>
        ) : (
          <div className="loading-splash-video loading-splash-video-fallback" aria-hidden="true">
            Chatons
          </div>
        )}
      </div>
      <div key={`loading-message-${messageIndex}`} className="loading-splash-copy">
        <p className="onboarding-intro-title">{LOADING_MESSAGES[messageIndex]}</p>
        <p className="onboarding-intro-body">Cats are doing startup checks. Please hold your meow.</p>
      </div>
    </div>
  )
}

function AppShell() {
  const { t } = useTranslation()
  const { state, isLoading, updateSettings } = useWorkspace()
  const [forceOnboardingOpen, setForceOnboardingOpen] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH)
  const [isResizing, setIsResizing] = useState(false)
  const resizeStartXRef = useRef(0)
  const resizeStartWidthRef = useRef(SIDEBAR_DEFAULT_WIDTH)
  const hasHydratedSidebarWidthRef = useRef(false)

  useEffect(() => {
    if (isLoading || hasHydratedSidebarWidthRef.current) {
      return
    }
    setSidebarWidth(clamp(state.settings.sidebarWidth, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH))
    hasHydratedSidebarWidthRef.current = true
  }, [isLoading, state.settings.sidebarWidth])

  useEffect(() => {
    if (!isResizing) {
      return
    }

    const handlePointerMove = (event: PointerEvent) => {
      const delta = event.clientX - resizeStartXRef.current
      const nextWidth = clamp(resizeStartWidthRef.current + delta, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH)
      setSidebarWidth(nextWidth)
    }

    const handlePointerUp = () => {
      setIsResizing(false)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
  }, [isResizing])

  const handleSidebarResizeStart = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    resizeStartXRef.current = event.clientX
    resizeStartWidthRef.current = sidebarWidth
    setIsResizing(true)
  }, [sidebarWidth])

  const handleSidebarResizeKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      const nextWidth = clamp(sidebarWidth - SIDEBAR_RESIZE_STEP, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH)
      setSidebarWidth(nextWidth)
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault()
      const nextWidth = clamp(sidebarWidth + SIDEBAR_RESIZE_STEP, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH)
      setSidebarWidth(nextWidth)
    }
  }, [sidebarWidth])

  useEffect(() => {
    document.documentElement.style.setProperty('--ui-sidebar-width', `${sidebarWidth}px`)
  }, [sidebarWidth])

  useEffect(() => {
    if (isLoading || isResizing || !hasHydratedSidebarWidthRef.current) {
      return
    }
    if (state.settings.sidebarWidth === sidebarWidth) {
      return
    }
    const timeout = window.setTimeout(() => {
      void updateSettings({ ...state.settings, sidebarWidth })
    }, 120)
    return () => window.clearTimeout(timeout)
  }, [isLoading, isResizing, sidebarWidth, state.settings, updateSettings])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')

    const applyTheme = () => {
      document.documentElement.classList.toggle('dark', media.matches)
    }

    applyTheme()
    media.addEventListener('change', applyTheme)

    return () => {
      media.removeEventListener('change', applyTheme)
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isMeta = navigator.platform.toLowerCase().includes('mac')
        ? event.metaKey
        : event.ctrlKey
      if (!isMeta || !event.shiftKey) return
      if (event.key.toLowerCase() !== 'o') return
      event.preventDefault()
      setForceOnboardingOpen(true)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      if (!state.settings.allowAnonymousTelemetry || !window.telemetry) return
      void window.telemetry.crash({
        message: event.message || 'window.error',
        stack: event.error?.stack,
        context: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
      })
    }
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (!state.settings.allowAnonymousTelemetry || !window.telemetry) return
      void window.telemetry.crash({
        message: 'window.unhandledrejection',
        context: {
          reason: event.reason instanceof Error
            ? { message: event.reason.message, stack: event.reason.stack }
            : event.reason,
        },
      })
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onUnhandledRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onUnhandledRejection)
    }
  }, [state.settings.allowAnonymousTelemetry])

  if (isLoading) {
    return <LoadingSplash />
  }

  if (!isLoading && (!state.settings.hasCompletedOnboarding || forceOnboardingOpen)) {
    return <OnboardingFlow onFinish={() => setForceOnboardingOpen(false)} />
  }

  return (
    <div className={`app-shell ${isResizing ? 'is-resizing' : ''}`}>
      <div className="app-layout">
        <Sidebar width={sidebarWidth} />

        <div
          className="sidebar-resize-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label={t('Redimensionner la barre latérale')}
          tabIndex={0}
          onPointerDown={handleSidebarResizeStart}
          onKeyDown={handleSidebarResizeKeyDown}
        />

        <main className="main-panel">
          {state.appMode === 'assistant' ? (
            <AssistantMainView />
          ) : (
            <>
              {state.sidebarMode === 'skills' || state.sidebarMode === 'extensions' || state.sidebarMode === 'extension-main-view' ? null : <Topbar />}
              <MainView />
              {state.sidebarMode === 'skills' || state.sidebarMode === 'extensions' || state.sidebarMode === 'extension-main-view' ? null : <Composer />}
            </>
          )}
        </main>
      </div>
      <TelemetryConsentCard />
    </div>
  )
}

export default function App() {
  const { isLogConsoleOpen, setIsLogConsoleOpen } = useLogConsole()
  const changelogManagerRef = useRef<ChangelogManagerHandle>(null!)

  // Set up the changelog manager ref so it can be accessed by other components
  useEffect(() => {
    setChangelogManagerRef(changelogManagerRef)
  }, [])

  return (
    <NotificationProvider>
      <WorkspaceProvider>
        <PiSettingsProvider>
          <ConversationSidePanelProvider>
            <BackgroundChannelExtensions>
              <AppShell />
              <ChangelogManager ref={changelogManagerRef} />
              <LogConsole 
                isOpen={isLogConsoleOpen} 
                onClose={() => setIsLogConsoleOpen(false)}
              />
            </BackgroundChannelExtensions>
          </ConversationSidePanelProvider>
        </PiSettingsProvider>
      </WorkspaceProvider>
    </NotificationProvider>
  )
}
