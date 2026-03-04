// electron/lib/logging/log-manager.ts
// Gestionnaire de logs pour capturer les logs Electron et Pi

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import electron from 'electron';
const { app } = electron;

type LogEntry = {
  timestamp: string
  source: 'electron' | 'pi' | 'frontend'
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  data?: any
}

type LogManagerOptions = {
  maxLogSize?: number
  maxLogFiles?: number
}

export class LogManager {
  private logFilePath: string
  private logDir: string
  private maxLogSize: number
  private maxLogFiles: number
  private logBuffer: LogEntry[] = []
  private isFlushing = false

  constructor(options: LogManagerOptions = {}) {
    this.maxLogSize = options.maxLogSize ?? 1024 * 1024 // 1MB par défaut
    this.maxLogFiles = options.maxLogFiles ?? 5
    
    // Créer le répertoire de logs dans le dossier de données de l'application
    this.logDir = path.join(app.getPath('userData'), 'logs')
    fs.mkdirSync(this.logDir, { recursive: true })
    
    // Nom du fichier de log avec timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    this.logFilePath = path.join(this.logDir, `chaton-${timestamp}.log`)
    
    // Nettoyer les anciens fichiers de log
    this.cleanupOldLogs()
    
    // Capturer les logs de la console
    this.captureConsoleLogs()
  }

  private cleanupOldLogs() {
    try {
      const files = fs.readdirSync(this.logDir)
      if (files.length <= this.maxLogFiles) return
      
      // Trier par date de modification (anciens en premier)
      const sortedFiles = files
        .map(file => ({
          name: file,
          time: fs.statSync(path.join(this.logDir, file)).mtime.getTime()
        }))
        .sort((a, b) => a.time - b.time)
      
      // Supprimer les fichiers les plus anciens
      for (let i = 0; i < sortedFiles.length - this.maxLogFiles; i++) {
        try {
          fs.unlinkSync(path.join(this.logDir, sortedFiles[i].name))
        } catch {
          // Ignorer les erreurs de suppression
        }
      }
    } catch {
      // Ignorer les erreurs de nettoyage
    }
  }

  private captureConsoleLogs() {
    const originalConsoleLog = console.log
    const originalConsoleWarn = console.warn
    const originalConsoleError = console.error
    const originalConsoleDebug = console.debug
    
    console.log = (...args: any[]) => {
      this.log('info', 'electron', args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '))
      originalConsoleLog.apply(console, args)
    }
    
    console.warn = (...args: any[]) => {
      this.log('warn', 'electron', args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '))
      originalConsoleWarn.apply(console, args)
    }
    
    console.error = (...args: any[]) => {
      this.log('error', 'electron', args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '))
      originalConsoleError.apply(console, args)
    }
    
    console.debug = (...args: any[]) => {
      this.log('debug', 'electron', args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '))
      originalConsoleDebug.apply(console, args)
    }
  }

  log(level: LogEntry['level'], source: LogEntry['source'], message: string, data?: any) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      source,
      level,
      message,
      data
    }
    
    this.logBuffer.push(entry)
    
    // Flush périodiquement
    if (this.logBuffer.length >= 10 && !this.isFlushing) {
      this.flushLogs()
    }
  }

  async flushLogs() {
    if (this.isFlushing || this.logBuffer.length === 0) return
    
    this.isFlushing = true
    
    try {
      // Vérifier la taille du fichier actuel
      let shouldRotate = false
      try {
        const stats = fs.statSync(this.logFilePath)
        if (stats.size > this.maxLogSize) {
          shouldRotate = true
        }
      } catch {
        // Fichier n'existe pas encore
      }
      
      // Rotation si nécessaire
      if (shouldRotate) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const newLogPath = path.join(this.logDir, `chaton-${timestamp}.log`)
        this.logFilePath = newLogPath
      }
      
      // Écrire les logs dans le fichier
      const logLines = this.logBuffer.map(entry => {
        return JSON.stringify(entry)
      }).join('\n') + '\n'
      
      fs.appendFileSync(this.logFilePath, logLines, 'utf8')
      this.logBuffer = []
    } catch (error) {
      console.error('Erreur lors de l\'écriture des logs:', error)
    } finally {
      this.isFlushing = false
    }
  }

  async getLogs(limit: number = 100): Promise<LogEntry[]> {
    try {
      // Lire le fichier de log
      if (!fs.existsSync(this.logFilePath)) {
        return []
      }
      
      const content = fs.readFileSync(this.logFilePath, 'utf8')
      const lines = content.trim().split('\n')
      
      // Parser les entrées de log
      const logs: LogEntry[] = []
      for (let i = Math.max(0, lines.length - limit); i < lines.length; i++) {
        try {
          const entry = JSON.parse(lines[i]) as LogEntry
          logs.push(entry)
        } catch {
          // Ignorer les lignes invalides
        }
      }
      
      // Ajouter les logs en mémoire
      logs.push(...this.logBuffer)
      
      return logs.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    } catch (error) {
      console.error('Erreur lors de la lecture des logs:', error)
      return []
    }
  }

  async clearLogs(): Promise<boolean> {
    try {
      this.logBuffer = []
      if (fs.existsSync(this.logFilePath)) {
        fs.unlinkSync(this.logFilePath)
      }
      return true
    } catch (error) {
      console.error('Erreur lors de la suppression des logs:', error)
      return false
    }
  }

  getLogFilePath(): string {
    return this.logFilePath
  }

  getLogDirectory(): string {
    return this.logDir
  }

  async shutdown() {
    await this.flushLogs()
  }
}

// Instance globale
let globalLogManager: LogManager | null = null

export function getLogManager(): LogManager {
  if (!globalLogManager) {
    globalLogManager = new LogManager()
  }
  return globalLogManager
}

export function initLogging() {
  return getLogManager()
}
