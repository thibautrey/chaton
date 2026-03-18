// src/lib/logger.ts
// Utilitaire de logging pour le frontend

export function logInfo(message: string, data?: unknown) {
  if (window.logger) {
    window.logger.log('info', message, data)
  } else {
    console.log(`[FRONTEND][INFO] ${message}`, data)
  }
  if (window.telemetry) {
    void window.telemetry.log('info', message, data)
  }
}

export function logWarn(message: string, data?: unknown) {
  if (window.logger) {
    window.logger.log('warn', message, data)
  } else {
    console.warn(`[FRONTEND][WARN] ${message}`, data)
  }
  if (window.telemetry) {
    void window.telemetry.log('warn', message, data)
  }
}

export function logError(message: string, data?: unknown) {
  if (window.logger) {
    window.logger.log('error', message, data)
  } else {
    console.error(`[FRONTEND][ERROR] ${message}`, data)
  }
  if (window.telemetry) {
    void window.telemetry.log('error', message, data)
  }
}

export function logDebug(message: string, data?: unknown) {
  if (window.logger) {
    window.logger.log('debug', message, data)
  } else {
    console.debug(`[FRONTEND][DEBUG] ${message}`, data)
  }
  if (window.telemetry) {
    void window.telemetry.log('debug', message, data)
  }
}

export const logger = {
  info: logInfo,
  warn: logWarn,
  error: logError,
  debug: logDebug
}
