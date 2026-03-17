// src/components/LogConsole.tsx
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { X, Copy, Trash2, FileText, Search, Filter, Download, ChevronDown, ChevronUp } from 'lucide-react'

type LogEntry = {
  id: string
  timestamp: string
  source: 'electron' | 'pi' | 'frontend'
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  data?: any
}

type LogConsoleProps = {
  isOpen: boolean
  onClose: () => void
}

// Helper function to basename since we can't import path in frontend
function basename(filePath: string): string {
  return filePath.split('/').pop() || filePath
}

export function LogConsole({ isOpen, onClose }: LogConsoleProps) {
  const { t } = useTranslation()
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
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (isOpen) {
      fetchLogs()
      fetchLogFilePath()
    }
  }, [isOpen])

  useEffect(() => {
    // Appliquer les filtres
    applyFilters()
  }, [logs, searchTerm, filterLevel, filterSource])

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
        const logsWithIds = fetchedLogs.map((log: any, idx: number) => ({
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

  const applyFilters = () => {
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
    const logText = filteredLogs.map(log => 
      `[${log.timestamp}] [${log.source.toUpperCase()}] [${log.level.toUpperCase()}] ${log.message}`
    ).join('\n')
    navigator.clipboard.writeText(logText)
      .then(() => alert('Logs copiés dans le presse-papiers'))
      .catch(() => alert('Échec de la copie des logs'))
  }

  const downloadLogs = () => {
    if (!logFilePath) return
    
    const element = document.createElement('a')
    element.setAttribute('href', `file://${logFilePath}`)
    element.setAttribute('download', basename(logFilePath))
    element.style.display = 'none'
    document.body.appendChild(element)
    element.click()
    document.body.removeChild(element)
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

  const toggleRowExpansion = (index: number) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev)
      if (newSet.has(index)) {
        newSet.delete(index)
      } else {
        newSet.add(index)
      }
      return newSet
    })
  }

  const shouldRenderConsole = isOpen

  if (!shouldRenderConsole) return null

  return (
    <div className="log-console-overlay fixed inset-0 z-50 flex items-end">
      <div ref={panelRef} className="log-console-panel h-2/3 w-full rounded-t-lg border-t shadow-lg">
        <div className="log-console-header flex items-center justify-between border-b p-4">
          <h2 className="text-lg font-semibold">Console de logs</h2>
          <div className="flex items-center space-x-2">
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
        
        <div className="log-console-toolbar border-b p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center space-x-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex-1"
              />
            </div>
            
            <div className="flex items-center space-x-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <select
                value={filterLevel}
                onChange={(e) => setFilterLevel(e.target.value as any)}
                className="log-console-select flex-1 rounded border p-2 text-sm"
              >
                <option value="all">Tous</option>
                <option value="info">Info</option>
                <option value="warn">Avert</option>
                <option value="error">Erreur</option>
                <option value="debug">Debug</option>
              </select>
            </div>
            
            <div className="flex items-center space-x-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <select
                value={filterSource}
                onChange={(e) => setFilterSource(e.target.value as any)}
                className="log-console-select flex-1 rounded border p-2 text-sm"
              >
                <option value="all">Tous</option>
                <option value="electron">Electron</option>
                <option value="pi">Pi</option>
                <option value="frontend">Frontend</option>
              </select>
            </div>
          </div>
        </div>
        
        <div className="flex-1 overflow-hidden">
          <div ref={scrollAreaRef} className="log-console-scroll h-full overflow-auto p-4">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground">{t('Aucun log trouvé')}</p>
              </div>
            ) : (
              <div className="space-y-2 text-sm">
                {filteredLogs.map((log, index) => {
                  const isExpanded = expandedRows.has(index)
                  return (
                    <div key={log.id} className="log-console-row-wrapper">
                      <div className="log-console-row flex items-start space-x-2 rounded p-2">
                        <span className={`log-console-time w-12 font-mono text-xs ${getLogLevelColor(log.level)}`}>
                          {formatTimestamp(log.timestamp)}
                        </span>
                        <span className={`log-console-source w-20 font-mono text-xs ${getSourceColor(log.source)}`}>
                          {log.source.toUpperCase()}
                        </span>
                        <span className={`log-console-message flex-1 font-medium ${getLogLevelColor(log.level)}`}>
                          {log.message}
                        </span>
                        {log.data && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => toggleRowExpansion(index)}
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
                      {isExpanded && log.data && (
                        <div className="log-console-details ml-[136px] mt-1 rounded border p-3 bg-muted/50">
                          <pre className="text-xs font-mono whitespace-pre-wrap break-all">
                            {JSON.stringify(log.data, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
        
        <div className="log-console-footer flex items-center justify-between border-t p-2">
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
