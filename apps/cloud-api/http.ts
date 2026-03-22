import http from 'node:http'
import { maxJsonBodyBytes } from './config.ts'

const ALLOWED_CORS_ORIGINS = new Set([
  'https://chatons.ai',
  'https://www.chatons.ai',
  'https://cloud.chatons.ai',
])

function buildCorsHeaders(request: http.IncomingMessage): Record<string, string> {
  const origin = request.headers.origin?.trim() ?? ''
  if (!ALLOWED_CORS_ORIGINS.has(origin)) {
    return {}
  }
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type,x-oidc-client-secret',
    'access-control-allow-credentials': 'true',
    vary: 'Origin',
  }
}

export function getBearerToken(request: http.IncomingMessage): string | null {
  const header = request.headers.authorization
  if (!header) {
    return null
  }
  const [scheme, token] = header.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null
  }
  return token.trim()
}

export function parseCookies(request: http.IncomingMessage): Record<string, string> {
  const header = request.headers.cookie
  if (!header) {
    return {}
  }
  return Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separatorIndex = part.indexOf('=')
        if (separatorIndex < 0) {
          return [part, '']
        }
        const key = part.slice(0, separatorIndex).trim()
        const value = part.slice(separatorIndex + 1).trim()
        try {
          return [key, decodeURIComponent(value)]
        } catch {
          return [key, value]
        }
      }),
  )
}

export function json(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  statusCode: number,
  payload: unknown,
): void {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    ...buildCorsHeaders(request),
  })
  response.end(JSON.stringify(payload))
}

export function html(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  statusCode: number,
  markup: string,
): void {
  response.writeHead(statusCode, {
    'content-type': 'text/html; charset=utf-8',
    ...buildCorsHeaders(request),
  })
  response.end(markup)
}

export function redirect(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  location: string,
  headers?: Record<string, string | string[]>,
): void {
  response.writeHead(302, {
    location,
    ...(headers ?? {}),
    ...buildCorsHeaders(request),
  })
  response.end()
}

export function setCookie(
  response: http.ServerResponse,
  name: string,
  value: string,
  options?: {
    maxAge?: number
    path?: string
    httpOnly?: boolean
    sameSite?: 'Lax' | 'Strict' | 'None'
    secure?: boolean
  },
): void {
  const parts = [`${name}=${encodeURIComponent(value)}`]
  parts.push(`Path=${options?.path ?? '/'}`)
  if (typeof options?.maxAge === 'number') {
    parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`)
  }
  if (options?.httpOnly !== false) {
    parts.push('HttpOnly')
  }
  if (options?.sameSite) {
    parts.push(`SameSite=${options.sameSite}`)
  }
  if (options?.secure !== false) {
    parts.push('Secure')
  }
  const existing = response.getHeader('set-cookie')
  const nextCookie = parts.join('; ')
  if (!existing) {
    response.setHeader('set-cookie', nextCookie)
    return
  }
  const cookies = Array.isArray(existing) ? existing : [String(existing)]
  response.setHeader('set-cookie', [...cookies, nextCookie])
}

export function handleCorsPreflight(
  request: http.IncomingMessage,
  response: http.ServerResponse,
): boolean {
  if (request.method !== 'OPTIONS') {
    return false
  }
  const headers = buildCorsHeaders(request)
  if (!headers['access-control-allow-origin']) {
    response.writeHead(403)
    response.end()
    return true
  }
  response.writeHead(204, headers)
  response.end()
  return true
}

export async function readJsonBody<T>(request: http.IncomingMessage): Promise<T> {
  const chunks: Buffer[] = []
  let totalSize = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    totalSize += buffer.length
    if (totalSize > maxJsonBodyBytes) {
      const error = new Error(`Request body exceeds ${maxJsonBodyBytes} bytes`)
      ;(error as Error & { statusCode?: number }).statusCode = 413
      throw error
    }
    chunks.push(buffer)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  return JSON.parse(text) as T
}

export async function readFormBody(request: http.IncomingMessage): Promise<Record<string, string>> {
  const chunks: Buffer[] = []
  let totalSize = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    totalSize += buffer.length
    if (totalSize > maxJsonBodyBytes) {
      const error = new Error(`Request body exceeds ${maxJsonBodyBytes} bytes`)
      ;(error as Error & { statusCode?: number }).statusCode = 413
      throw error
    }
    chunks.push(buffer)
  }
  const parsed = new URLSearchParams(Buffer.concat(chunks).toString('utf8'))
  return Object.fromEntries(parsed.entries())
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
