import { type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Sidebar } from '@/components/sidebar/Sidebar'
import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow'
import { Composer } from '@/components/shell/Composer'
import { MainView } from '@/components/shell/MainView'
import { Topbar } from '@/components/shell/Topbar'
import { ChangelogManager } from '@/components/ChangelogManager'
import { LogConsole } from '@/components/LogConsole'
import { PiSettingsProvider } from '@/features/workspace/pi-settings-store'
import { WorkspaceProvider } from '@/features/workspace/store'
import { useWorkspace } from '@/features/workspace/store'
import { useLogConsole } from '@/hooks/use-log-console'

const SIDEBAR_MIN_WIDTH = 260
const SIDEBAR_MAX_WIDTH = 460
const SIDEBAR_DEFAULT_WIDTH = 320
const SIDEBAR_RESIZE_STEP = 16

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function AppShell() {
  const { t } = useTranslation()
  const { state, isLoading, updateSettings } = useWorkspace()
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

  const handleSidebarResizeStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    resizeStartXRef.current = event.clientX
    resizeStartWidthRef.current = sidebarWidth
    setIsResizing(true)
  }

  const handleSidebarResizeKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
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
  }

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

  if (!isLoading && !state.settings.hasCompletedOnboarding) {
    return <OnboardingFlow />
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
          {state.sidebarMode === 'skills' || state.sidebarMode === 'extensions' ? null : <Topbar />}
          <MainView />
          {state.sidebarMode === 'skills' || state.sidebarMode === 'extensions' ? null : <Composer />}
        </main>
      </div>
    </div>
  )
}

export default function App() {
  const { isLogConsoleOpen, setIsLogConsoleOpen } = useLogConsole()

  return (
    <WorkspaceProvider>
      <PiSettingsProvider>
        <AppShell />
        <ChangelogManager />
        <LogConsole 
          isOpen={isLogConsoleOpen} 
          onClose={() => setIsLogConsoleOpen(false)}
        />
      </PiSettingsProvider>
    </WorkspaceProvider>
  )
}
