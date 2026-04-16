import http from 'node:http'
import https from 'node:https'
import { URL } from 'node:url'
import type { RequestOptions } from 'node:http'
import type { IncomingMessage } from 'node:http'

const MAX_BODY_BYTES = 1024 * 1024

type FetchOptions = RequestOptions & {
  body?: string | Buffer
}

/**
 * Build CORS headers for a given request
 */
function buildCorsHeaders(request: http.IncomingMessage): Record<string, string> {
  const origin = request.headers.origin
  if (!origin) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  }
}

export function handleCorsPreflight(
  request: http.IncomingMessage,
  response: http.ServerResponse,
): boolean {
  if ((request.method ?? 'GET').toUpperCase() !== 'OPTIONS') {
    return false
  }
  response.writeHead(204, {
    ...buildCorsHeaders(request),
  })
  response.end()
  return true
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
  return token.trim() || null
}

export function parseCookies(request: http.IncomingMessage): Record<string, string> {
  const raw = request.headers.cookie ?? ''
  return raw
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((cookies, part) => {
      const separator = part.indexOf('=')
      if (separator <= 0) {
        return cookies
      }
      const key = part.slice(0, separator).trim()
      const value = part.slice(separator + 1).trim()
      if (!key) {
        return cookies
      }
      try {
        cookies[key] = decodeURIComponent(value)
      } catch {
        cookies[key] = value
      }
      return cookies
    }, {})
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function escapeHtmlComment(value: string): string {
  return escapeHtml(value).replace(/-/g, '&#45;')
}

function serializeCookie(name: string, value: string, options?: {
  maxAge?: number
  path?: string
  httpOnly?: boolean
  sameSite?: 'Strict' | 'Lax' | 'None'
  secure?: boolean
}): string {
  const parts = [`${name}=${encodeURIComponent(value)}`]
  if (typeof options?.maxAge === 'number' && Number.isFinite(options.maxAge)) {
    parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`)
  }
  parts.push(`Path=${options?.path ?? '/'}`)
  if (options?.httpOnly !== false) {
    parts.push('HttpOnly')
  }
  if (options?.sameSite) {
    parts.push(`SameSite=${options.sameSite}`)
  }
  if (options?.secure) {
    parts.push('Secure')
  }
  return parts.join('; ')
}

export function setCookie(
  response: http.ServerResponse,
  name: string,
  value: string,
  options?: {
    maxAge?: number
    path?: string
    httpOnly?: boolean
    sameSite?: 'Strict' | 'Lax' | 'None'
    secure?: boolean
  },
): void {
  const nextCookie = serializeCookie(name, value, options)
  const existing = response.getHeader('Set-Cookie')
  if (!existing) {
    response.setHeader('Set-Cookie', nextCookie)
    return
  }
  const cookies = Array.isArray(existing) ? existing.map(String) : [String(existing)]
  cookies.push(nextCookie)
  response.setHeader('Set-Cookie', cookies)
}

async function readBody(request: IncomingMessage, maxBytes = MAX_BODY_BYTES): Promise<string> {
  const chunks: Buffer[] = []
  let totalSize = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    totalSize += buffer.length
    if (totalSize > maxBytes) {
      const error = new Error(`Request body exceeds ${maxBytes} bytes`) as Error & { statusCode?: number }
      error.statusCode = 413
      throw error
    }
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const raw = await readBody(request)
  return JSON.parse(raw || '{}') as T
}

export async function readFormBody(request: IncomingMessage): Promise<Record<string, string>> {
  const raw = await readBody(request)
  const params = new URLSearchParams(raw)
  const values: Record<string, string> = {}
  for (const [key, value] of params.entries()) {
    values[key] = value
  }
  return values
}

/**
 * Sends a JSON response with proper headers and error filtering
 */
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
  const safePayload = sanitizeForJson(payload)
  response.end(JSON.stringify(safePayload))
}

/**
 * Sanitizes data for JSON serialization by removing sensitive properties.
 * This prevents stack traces, internal paths, and other sensitive info from leaking.
 */
function sanitizeForJson(data: unknown): unknown {
  if (data === null || data === undefined || typeof data !== 'object') {
    return data
  }

  if (Array.isArray(data)) {
    return data.map(sanitizeForJson)
  }

  if (data instanceof Error) {
    return {
      name: 'Error',
      message: data.message || 'An error occurred',
    }
  }

  const result: Record<string, unknown> = {}
  const sensitiveKeys = new Set([
    'stack',
    'description',
    '__proto__',
    'constructor',
    'prototype',
    'fileName',
    'lineNumber',
    'columnNumber',
    'source',
    'stackTrace',
    'cause',
    'originalError',
    'innerError',
    'nestedError',
    'details',
    'config',
    'headers',
    'request',
    'response',
  ])

  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase()
    let isSensitive = sensitiveKeys.has(key) || sensitiveKeys.has(lowerKey)

    if (!isSensitive && (key.includes('stack') || key.includes('trace') || key.includes('stackTrace'))) {
      isSensitive = true
    }

    if (!isSensitive) {
      result[key] = sanitizeForJson(value)
    }
  }

  return result
}

export function html(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  statusCode: number,
  markup: string,
): void {
  response.writeHead(statusCode, {
    'content-type': 'text/html; charset=utf-8',
    'x-content-type-options': 'nosniff',
    ...buildCorsHeaders(request),
  })
  const safeMarkup = sanitizeHtml(markup)
  response.end(safeMarkup)
}

function sanitizeHtml(markup: string): string {
  if (!markup || typeof markup !== 'string') return ''

  let result = markup
  result = result.replace(/<script[\s\S]*?<\/script\s*>/gi, '')
  result = result.replace(/<script[\s\S]*$/gi, '')
  result = result.replace(/<\/script\s*>/gi, '')
  result = result.replace(/\s+on\w+\s*=/gi, ' ')
  result = result.replace(/\s*javascript\s*:/gi, '')
  result = result.replace(/\s*data\s*:/gi, '')
  return result
}

export function sanitizeRedirectTarget(location: string, baseUrl: string): string | null {
  try {
    const base = new URL(baseUrl)
    const target = new URL(location, base)
    if ((target.protocol !== 'http:' && target.protocol !== 'https:') || target.origin !== base.origin) {
      return null
    }
    const safePathname = target.pathname.replace(/[^a-zA-Z0-9/_-]/g, encodeURIComponent)
    return `${safePathname}${target.search}${target.hash}`
  } catch {
    return null
  }
}

export function redirect(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  location: string,
  baseUrl: string,
  headers?: Record<string, string | string[]>,
): void {
  const safeLocation = sanitizeRedirectTarget(location, baseUrl)
  if (!safeLocation) {
    response.writeHead(400, { 'content-type': 'text/plain' })
    response.end('Invalid redirect target')
    return
  }
  response.writeHead(302, {
    location: safeLocation,
    ...buildCorsHeaders(request),
    ...headers,
  })
  response.end()
}

export function sendFile(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  statusCode: number,
  content: string | Buffer,
  contentType: string,
): void {
  response.writeHead(statusCode, {
    'content-type': contentType,
    ...buildCorsHeaders(request),
  })
  response.end(content)
}

export async function fetch(url: string, options?: FetchOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const opts: RequestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options?.method || 'GET',
      headers: options?.headers,
    }
    const protocol = urlObj.protocol === 'https:' ? https : http
    const req = protocol.request(opts, (res: IncomingMessage) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    })
    req.on('error', reject)
    if (options?.body) {
      req.write(options.body)
    }
    req.end()
  })
}
