// src/components/LogConsole.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { X, Copy, Trash2, FileText, Search, Filter, Download, ChevronDown, ChevronUp } from 'lucide-react'
import { useWorkspace } from '@/features/workspace/store'

type LogEntry = {
  id?: string
  timestamp: string
  source: 'electron' | 'pi' | 'frontend'
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  data?: unknown
  conversationId?: string
}

type LogLevel = LogEntry['level']
type LogSource = LogEntry['source']

type LogConsoleProps = {
  isOpen: boolean
  onClose: () => void
}

type GroupedLogs = {
  key: string
  conversationId?: string
  title: string
  logs: LogEntry[]
}

// Helper function to basename since we can't import path in frontend
function basename(filePath: string): string {
  return filePath.split('/').pop() || filePath
}

export function LogConsole({ isOpen, onClose }: LogConsoleProps) {
  const { t } = useTranslation()
  const { state } = useWorkspace()
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [filteredLogs, setFilteredLogs] = useState<LogEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterLevel, setFilterLevel] = useState<'all' | 'info' | 'warn' | 'error' | 'debug'>('all')
  const [filterSource, setFilterSource] = useState<'all' | 'electron' | 'pi' | 'frontend'>('all')
  const [autoScroll, setAutoScroll] = useState(true)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [logFilePath, setLogFilePath] = useState('')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  const conversationTitleById = useMemo(() => {
    return new Map(state.conversations.map((conversation) => [conversation.id, conversation.title]))
  }, [state.conversations])

  const applyFilters = useCallback(() => {
    let result = [...logs]

    // Filtre par niveau
    if (filterLevel !== 'all') {
      result = result.filter(log => log.level === filterLevel)
    }

    // Filtre par source
    if (filterSource !== 'all') {
      result = result.filter(log => log.source === filterSource)
    }

    // Filtre par recherche
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase()
      result = result.filter(log =>
        log.message.toLowerCase().includes(searchLower) ||
        (log.data && JSON.stringify(log.data).toLowerCase().includes(searchLower))
      )
    }

    setFilteredLogs(result)
  }, [logs, filterLevel, filterSource, searchTerm])

  useEffect(() => {
    if (isOpen) {
      fetchLogs()
      fetchLogFilePath()
    }
  }, [isOpen])

  useEffect(() => {
    // Appliquer les filtres
    applyFilters()
  }, [applyFilters])

  useEffect(() => {
    if (autoScroll && scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight
    }
  }, [filteredLogs, autoScroll])

  // Gérer la touche Échap pour fermer le panneau
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Gérer le clic en dehors du panneau pour le fermer
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, onClose])

  const fetchLogs = async () => {
    setIsLoading(true)
    try {
      if (window.logger) {
        const fetchedLogs = await window.logger.getLogs(500)
        // Add unique IDs to logs if not present
        const logsWithIds = fetchedLogs.map((log: LogEntry, idx: number) => ({
          ...log,
          id: log.id || `${log.timestamp}-${log.source}-${log.level}-${idx}`,
        }))
        setLogs(logsWithIds)
      }
    } catch (error) {
      console.error('Erreur lors de la récupération des logs:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const fetchLogFilePath = async () => {
    try {
      if (window.logger) {
        const path = await window.logger.getLogFilePath()
        setLogFilePath(path)
      }
    } catch (error) {
      console.error('Erreur lors de la récupération du chemin du fichier de log:', error)
    }
  }

  const clearLogs = async () => {
    if (window.logger) {
      const confirmed = window.confirm('Êtes-vous sûr de vouloir effacer tous les logs ?')
      if (confirmed) {
        try {
          await window.logger.clearLogs()
          setLogs([])
          setFilteredLogs([])
        } catch (error) {
          console.error('Erreur lors de l\'effacement des logs:', error)
        }
      }
    }
  }

  const copyLogsToClipboard = () => {
    const logText = filteredLogs.map(log => {
      const conversationLabel = log.conversationId ? ` [CONVERSATION ${log.conversationId}]` : ''
      return `[${log.timestamp}] [${log.source.toUpperCase()}] [${log.level.toUpperCase()}]${conversationLabel} ${log.message}`
    }).join('\n')
    navigator.clipboard.writeText(logText)
      .then(() => alert('Logs copiés dans le presse-papiers'))
      .catch(() => alert('Échec de la copie des logs'))
  }

  const downloadLogs = async () => {
    try {
      if (!window.logger?.saveCopy) return
      const result = await window.logger.saveCopy()
      if (!result.ok && !result.cancelled) {
        alert(result.message || 'Échec du téléchargement des logs')
      }
    } catch (error) {
      console.error('Erreur lors du téléchargement des logs:', error)
      alert('Échec du téléchargement des logs')
    }
  }

  const getLogLevelColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'error': return 'text-red-700 dark:text-red-300'
      case 'warn': return 'text-amber-700 dark:text-amber-300'
      case 'debug': return 'text-blue-700 dark:text-blue-300'
      case 'info':
      default: return 'text-emerald-700 dark:text-emerald-300'
    }
  }

  const getSourceColor = (source: LogEntry['source']) => {
    switch (source) {
      case 'electron': return 'text-violet-700 dark:text-violet-300'
      case 'pi': return 'text-orange-700 dark:text-orange-300'
      case 'frontend': return 'text-sky-700 dark:text-sky-300'
      default: return 'text-slate-700 dark:text-slate-300'
    }
  }

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString()
  }

  const groupedLogs = useMemo<GroupedLogs[]>(() => {
    const groups = new Map<string, GroupedLogs>()

    filteredLogs.forEach((log) => {
      const conversationId = log.conversationId ?? undefined
      const key = conversationId ?? '__no_conversation__'
      const title = conversationId
        ? (conversationTitleById.get(conversationId) ?? `Conversation ${conversationId.slice(0, 8)}`)
        : 'Autres logs'

      const existing = groups.get(key)
      if (existing) {
        existing.logs.push(log)
        return
      }

      groups.set(key, {
        key,
        conversationId,
        title,
        logs: [log],
      })
    })

    return Array.from(groups.values())
  }, [conversationTitleById, filteredLogs])

  const toggleRowExpansion = (rowKey: string) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev)
      if (newSet.has(rowKey)) {
        newSet.delete(rowKey)
      } else {
        newSet.add(rowKey)
      }
      return newSet
    })
  }

  const shouldRenderConsole = isOpen

  if (!shouldRenderConsole) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/45 dark:bg-black/65">
      <div 
        ref={panelRef} 
        className="flex flex-col h-2/3 w-full rounded-t-xl border-t border-[#d5dae3] dark:border-[#263142] bg-[#f7f9fc] dark:bg-[#0f1623] shadow-lg"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#d5dae3] dark:border-[#263142] p-4">
          <h2 className="text-lg font-semibold text-[#1f2633] dark:text-[#e8eefb]">Console de logs</h2>
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={fetchLogs}
              disabled={isLoading}
              title="Rafraîchir"
            >
              ↻
            </Button>
            
            <Button variant="ghost" size="sm" onClick={copyLogsToClipboard} title="Copier">
              <Copy className="h-4 w-4" />
            </Button>
            
            <Button variant="ghost" size="sm" onClick={downloadLogs} disabled={!logFilePath} title="Télécharger">
              <Download className="h-4 w-4" />
            </Button>
            
            <Button variant="ghost" size="sm" onClick={clearLogs} title="Effacer">
              <Trash2 className="h-4 w-4" />
            </Button>
            
            <Button variant="ghost" size="sm" onClick={onClose} title="Fermer">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        {/* Toolbar */}
        <div className="border-b border-[#d5dae3] dark:border-[#263142] p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex-1"
              />
            </div>
            
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <select
                value={filterLevel}
                onChange={(e) => setFilterLevel(e.target.value as LogLevel)}
                className="flex-1 rounded border border-[#c9d1de] dark:border-[#2b3649] bg-white dark:bg-[#121c2b] p-2 text-sm text-[#1f2633] dark:text-[#e8eefb]"
              >
                <option value="all">Tous</option>
                <option value="info">Info</option>
                <option value="warn">Avert</option>
                <option value="error">Erreur</option>
                <option value="debug">Debug</option>
              </select>
            </div>
            
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <select
                value={filterSource}
                onChange={(e) => setFilterSource(e.target.value as LogSource)}
                className="flex-1 rounded border border-[#c9d1de] dark:border-[#2b3649] bg-white dark:bg-[#121c2b] p-2 text-sm text-[#1f2633] dark:text-[#e8eefb]"
              >
                <option value="all">Tous</option>
                <option value="electron">Electron</option>
                <option value="pi">Pi</option>
                <option value="frontend">Frontend</option>
              </select>
            </div>
          </div>
        </div>
        
        {/* Scroll Area */}
        <div className="flex-1 overflow-hidden">
          <div 
            ref={scrollAreaRef} 
            className="h-full overflow-auto p-4 bg-[#f3f6fb] dark:bg-[#0b121d]"
          >
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground">{t('Aucun log trouvé')}</p>
              </div>
            ) : (
              <div className="space-y-4 text-sm">
                {groupedLogs.map((group) => (
                  <div 
                    key={group.key} 
                    className="rounded-lg border border-[#d5dae3] dark:border-[#32425b] bg-background/50"
                  >
                    <div className="flex items-center justify-between border-b border-[#d5dae3] dark:border-[#32425b] px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate font-medium text-[#1f2633] dark:text-[#e8eefb]">{group.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {group.conversationId ? `conversationId: ${group.conversationId}` : 'Logs sans conversation associée'}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">{group.logs.length} log(s)</div>
                    </div>
                    <div className="space-y-2 p-2">
                      {group.logs.map((log) => {
                        const rowKey = log.id ?? `${log.timestamp}-${log.message}`
                        const isExpanded = expandedRows.has(rowKey)
                        return (
                          <div key={rowKey}>
                            <div className="flex items-start gap-2 rounded p-2 border border-transparent hover:border-[#d5dae3] hover:bg-[#e8edf6] dark:hover:border-[#32425b] dark:hover:bg-[#162235] transition-colors">
                              <span className={`w-12 font-mono text-xs text-[#445065] dark:text-[#9fb0ca] ${getLogLevelColor(log.level)}`}>
                                {formatTimestamp(log.timestamp)}
                              </span>
                              <span className={`w-20 font-mono text-xs pl-1.5 text-[#445065] dark:text-[#9fb0ca] ${getSourceColor(log.source)}`}>
                                {String(log.source).toUpperCase()}
                              </span>
                              <span className={`flex-1 font-medium text-[#1f2633] dark:text-[#e8eefb] ${getLogLevelColor(log.level)}`}>
                                {String(log.message)}
                              </span>
                              {Boolean(log.data) && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0"
                                  onClick={() => toggleRowExpansion(rowKey)}
                                  title={isExpanded ? 'Masquer les détails' : 'Afficher les détails'}
                                >
                                  {isExpanded ? (
                                    <ChevronUp className="h-4 w-4" />
                                  ) : (
                                    <ChevronDown className="h-4 w-4" />
                                  )}
                                </Button>
                              )}
                            </div>
                            {isExpanded && Boolean(log.data) && (
                              <div className="ml-[136px] mt-1 rounded border border-[#d5dae3] dark:border-[#32425b] p-3 bg-muted/50">
                                <pre className="text-xs font-mono whitespace-pre-wrap break-all">
                                  {String(JSON.stringify(log.data, null, 2))}
                                </pre>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        
        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[#d5dae3] dark:border-[#263142] p-2">
          <div>
            <span className="text-xs text-muted-foreground">
              {filteredLogs.length} logs affichés sur {logs.length} totaux
            </span>
          </div>
          <div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setAutoScroll(!autoScroll)}
              className="text-xs"
            >
              {autoScroll ? '⏸ Auto-scroll' : '▶ Auto-scroll'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
