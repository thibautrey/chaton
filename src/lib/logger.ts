// src/lib/logger.ts
// Utilitaire de logging pour le frontend

export function logInfo(message: string, data?: any) {
  if (window.logger) {
    window.logger.log('info', message, data)
  } else {
    console.log(`[FRONTEND][INFO] ${message}`, data)
  }
}

export function logWarn(message: string, data?: any) {
  if (window.logger) {
    window.logger.log('warn', message, data)
  } else {
    console.warn(`[FRONTEND][WARN] ${message}`, data)
  }
}

export function logError(message: string, data?: any) {
  if (window.logger) {
    window.logger.log('error', message, data)
  } else {
    console.error(`[FRONTEND][ERROR] ${message}`, data)
  }
}

export function logDebug(message: string, data?: any) {
  if (window.logger) {
    window.logger.log('debug', message, data)
  } else {
    console.debug(`[FRONTEND][DEBUG] ${message}`, data)
  }
}

export const logger = {
  info: logInfo,
  warn: logWarn,
  error: logError,
  debug: logDebug
}
