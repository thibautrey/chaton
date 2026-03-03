import { type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react'

import { Sidebar } from '@/components/sidebar/Sidebar'
import { Composer } from '@/components/shell/Composer'
import { MainView } from '@/components/shell/MainView'
import { Topbar } from '@/components/shell/Topbar'
import { WorkspaceProvider } from '@/features/workspace/store'

const SIDEBAR_MIN_WIDTH = 260
const SIDEBAR_MAX_WIDTH = 460
const SIDEBAR_DEFAULT_WIDTH = 320
const SIDEBAR_RESIZE_STEP = 16

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function AppShell() {
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH)
  const [isResizing, setIsResizing] = useState(false)
  const resizeStartXRef = useRef(0)
  const resizeStartWidthRef = useRef(SIDEBAR_DEFAULT_WIDTH)

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
      setSidebarWidth((width) => clamp(width - SIDEBAR_RESIZE_STEP, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH))
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault()
      setSidebarWidth((width) => clamp(width + SIDEBAR_RESIZE_STEP, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH))
    }
  }

  return (
    <div className={`app-shell ${isResizing ? 'is-resizing' : ''}`}>
      <div className="app-layout">
        <Sidebar width={sidebarWidth} />

        <div
          className="sidebar-resize-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label="Redimensionner la barre latérale"
          tabIndex={0}
          onPointerDown={handleSidebarResizeStart}
          onKeyDown={handleSidebarResizeKeyDown}
        />

        <main className="main-panel">
          <Topbar />
          <MainView />
          <Composer />
        </main>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <WorkspaceProvider>
      <AppShell />
    </WorkspaceProvider>
  )
}
