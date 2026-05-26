type LogMethod = 'log' | 'info' | 'warn' | 'error' | 'debug'

const isDev = import.meta.env.DEV

function write(method: LogMethod, args: unknown[]): void {
  if (method === 'error' || method === 'warn' || isDev) {
    console[method](...args)
  }
}

export const logger = {
  log: (...args: unknown[]) => write('log', args),
  info: (...args: unknown[]) => write('info', args),
  warn: (...args: unknown[]) => write('warn', args),
  error: (...args: unknown[]) => write('error', args),
  debug: (...args: unknown[]) => write('debug', args),
}
