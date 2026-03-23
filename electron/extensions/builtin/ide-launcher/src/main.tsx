import React from 'react'
import ReactDOM from 'react-dom/client'

import './ide-launcher.css'

type Ide = {
  id: string
  label: string
  command?: string
  commands?: string[]
  icon: 'svg' | 'image' | 'none' | 'text'
  svg?: string
  text?: string
  image?: string
}

type DetectedIde = Ide & { resolvedCommand: string }

declare global {
  interface Window {
    chaton: {
      detectExternalCommand: (command: string) => Promise<{ detected: boolean }>
      openExternalApplication: (
        command: string,
        args: string[],
      ) => Promise<{ success: boolean; error?: string }>
    }
  }
}

const IDES: Ide[] = [
  { id: 'vs-code', label: 'VS Code', command: 'code', icon: 'svg', svg: `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="#0065A9" d="M17.6 2.2 7.4 12l10.2 9.8c.6.5 1.4.1 1.4-.7V2.9c0-.8-.8-1.2-1.4-.7Z"/>
      <path fill="#007ACC" d="M19 4.4 11.2 10.5 6.4 6.8 3.5 8.3l4.6 3.7-4.6 3.7 2.9 1.5 4.8-3.7L19 19.6c.6.5 1.4.1 1.4-.7V5.1c0-.8-.8-1.2-1.4-.7Z"/>
      <path fill="#1F9CF0" d="m14.1 12 4.9-3.8v7.6L14.1 12Z"/>
    </svg>
  ` },
  { id: 'cursor', label: 'Cursor', command: 'cursor', icon: 'text', text: 'C' },
  { id: 'windsurf', label: 'Windsurf', command: 'windsurf', icon: 'text', text: 'W' },
  {
    id: 'jetbrains',
    label: 'JetBrains IDE',
    commands: ['idea', 'webstorm', 'pycharm', 'goland', 'phpstorm', 'rubymine', 'clion'],
    icon: 'text',
    text: 'J',
  },
  { id: 'zed', label: 'Zed', command: 'zed', icon: 'text', text: 'Z' },
]

const EXTENSION_ID = '@chaton/ide-launcher'

function storageKey(projectId: string | null) {
  return projectId ? `preferred-ide:${projectId}` : null
}

function getIcon(ide: Ide | null) {
  if (!ide) return '...'
  if (ide.icon === 'svg' && ide.svg) {
    return <span className="icon icon-svg" dangerouslySetInnerHTML={{ __html: ide.svg }} />
  }
  if (ide.icon === 'image' && ide.image) {
    return <img className="icon icon-image" src={ide.image} alt={ide.label} />
  }
  return <span className="icon">{ide.text || '?'}</span>
}

async function resolveIde(ide: Ide): Promise<DetectedIde | null> {
  if (Array.isArray(ide.commands)) {
    for (const command of ide.commands) {
      try {
        const result = await window.chaton.detectExternalCommand(command)
        if (result?.detected) return { ...ide, resolvedCommand: command }
      } catch {
        // ignore
      }
    }
    return null
  }

  if (!ide.command) return null

  try {
    const result = await window.chaton.detectExternalCommand(ide.command)
    if (result?.detected) return { ...ide, resolvedCommand: ide.command }
  } catch {
    // ignore
  }
  return null
}

function IdeLauncherApp() {
  const [available, setAvailable] = React.useState<DetectedIde[]>([])
  const [storedId, setStoredId] = React.useState<string | null>(null)
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [targetPath, setTargetPath] = React.useState<string | null>(null)
  const [projectId, setProjectId] = React.useState<string | null>(null)
  const [menuOpen, setMenuOpen] = React.useState(false)

  const selected = React.useMemo(
    () => available.find((ide) => ide.id === selectedId) ?? available[0] ?? null,
    [available, selectedId],
  )

  React.useEffect(() => {
    const key = storageKey(projectId)
    if (key) {
      const stored = window.localStorage.getItem(key)
      setStoredId(stored || null)
    } else {
      setStoredId(null)
    }
  }, [projectId])

  React.useEffect(() => {
    if (storedId && available.some((ide) => ide.id === storedId)) {
      setSelectedId(storedId)
      return
    }
    if (selectedId && available.some((ide) => ide.id === selectedId)) {
      return
    }
    setSelectedId(available[0]?.id ?? null)
  }, [available, selectedId, storedId])

  const refresh = React.useCallback(async () => {
    const resolved = await Promise.all(IDES.map(resolveIde))
    const filtered = resolved.filter((value): value is DetectedIde => Boolean(value))
    setAvailable(filtered)
    if (filtered.length === 0) {
      setSelectedId(null)
      return
    }
    if (!filtered.some((ide) => ide.id === selectedId)) {
      setSelectedId(filtered[0].id)
    }
  }, [selectedId])

  const launch = React.useCallback(async () => {
    if (!selected?.resolvedCommand || !targetPath) return
    try {
      const result = await window.chaton.openExternalApplication(selected.resolvedCommand, [
        targetPath,
      ])
      if (!result?.success) {
        console.warn(result?.error || `Failed to open ${selected.label}`)
      }
    } catch (error) {
      console.warn('Failed to launch IDE', error)
    }
  }, [selected, targetPath])

  React.useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      const option = target.closest('[data-ide-id]') as HTMLElement | null
      if (option) {
        const ideId = option.getAttribute('data-ide-id')
        const ide = available.find((entry) => entry.id === ideId)
        if (ide) {
          setSelectedId(ide.id)
          const key = storageKey(projectId)
          if (key) window.localStorage.setItem(key, ide.id)
        }
        setMenuOpen(false)
        event.stopPropagation()
        return
      }
      if (!target.closest('.widget')) {
        setMenuOpen(false)
      }
    }

    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [available, projectId])

  React.useEffect(() => {
    const messageHandler = (event: MessageEvent) => {
      const message = event.data
      if (!message || typeof message !== 'object') return
      if (message.type === 'chaton.extension.topbarContext') {
        const context = message.payload
        const worktree = typeof context?.conversation?.worktreePath === 'string' ? context.conversation.worktreePath : null
        const repo = typeof context?.project?.repoPath === 'string' ? context.project.repoPath : null
        const nextProjectId = typeof context?.project?.id === 'string' ? context.project.id : null
        setTargetPath(worktree || repo)
        setProjectId(nextProjectId)
        setMenuOpen(false)
        void refresh()
        return
      }
      if (message.type === 'chaton.extension.deeplink') {
        const payload = message.payload
        if (!payload) return
        if (payload.target === 'open-selected-ide') {
          void launch()
        }
      }
    }

    window.addEventListener('message', messageHandler)
    return () => window.removeEventListener('message', messageHandler)
  }, [launch, refresh])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  React.useEffect(() => {
    const isVisible = available.length >= 1
    window.parent.postMessage(
      { type: 'chaton.extension.widgetVisibility', payload: { isVisible } },
      '*',
    )
  }, [available.length])

  if (available.length === 0) {
    return (
      <div className="widget widget-empty" aria-live="polite">
        <span className="empty-text">No IDE detected</span>
      </div>
    )
  }

  return (
    <div className="widget">
      <div className="control">
        <button
          type="button"
          className="btn btn-launch"
          onClick={() => {
            void launch()
          }}
          disabled={!selected || !targetPath}
          aria-label="Launch IDE"
          title="Launch IDE"
        >
          {getIcon(selected)}
        </button>
        <button
          type="button"
          className="btn btn-toggle"
          onClick={() => {
            if (available.length < 2) return
            setMenuOpen((prev) => !prev)
          }}
          disabled={available.length < 2}
          aria-label="Choose IDE"
          title="Choose IDE"
        >
          ▾
        </button>
      </div>
      <div className={`dropdown ${menuOpen ? 'open' : ''}`} role="menu">
        {available.map((ide) => (
          <button
            key={ide.id}
            type="button"
            className={`option ${selected?.id === ide.id ? 'active' : ''}`}
            data-ide-id={ide.id}
          >
            {getIcon(ide)}
            <span>{ide.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function mount() {
  const rootElement = document.getElementById('root')
  if (!rootElement) return false
  const root = ReactDOM.createRoot(rootElement)
  root.render(<IdeLauncherApp />)
  return true
}

if (!mount()) {
  window.addEventListener(
    'DOMContentLoaded',
    () => {
      void mount()
    },
    { once: true },
  )
}
