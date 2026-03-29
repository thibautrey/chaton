import http from 'node:http'
import { URL } from 'node:url'
import type { RequestOptions } from 'node:http'

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
  // Safely serialize payload, filtering out sensitive properties
  const safePayload = sanitizeForJson(payload)
  response.end(JSON.stringify(safePayload))
}

/**
 * Sanitizes data for JSON serialization by removing sensitive properties.
 * This prevents stack traces, internal paths, and other sensitive info from leaking.
 */
function sanitizeForJson(data: unknown): unknown {
  // Return primitives and null as-is
  if (data === null || data === undefined || typeof data !== 'object') {
    return data
  }

  // Handle arrays - sanitize each element
  if (Array.isArray(data)) {
    return data.map(sanitizeForJson)
  }

  // Handle Error objects - return only safe properties
  if (data instanceof Error) {
    return {
      name: 'Error',
      message: data.message || 'An error occurred',
    }
  }

  // Handle plain objects - filter out sensitive properties recursively
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
    // Skip sensitive keys (case-insensitive check for extra safety)
    const lowerKey = key.toLowerCase()
    let isSensitive = sensitiveKeys.has(key) || sensitiveKeys.has(lowerKey)
    
    // Also skip keys that look like they might contain stack traces
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
  // Markups should be pre-sanitized by the caller, but we escape common XSS patterns
  // as a defense-in-depth measure
  const safeMarkup = sanitizeHtml(markup)
  response.end(safeMarkup)
}

/**
 * Basic HTML sanitization for defense-in-depth.
 * This should not be relied upon as the primary security measure.
 */
function sanitizeHtml(html: string): string {
  if (!html || typeof html !== 'string') return ''
  
  return html
    // Remove script tags
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    // Remove event handler attributes
    .replace(/\s+on\w+\s*=/gi, ' ')
    // Remove javascript: URLs in attributes
    .replace(/\s*javascript\s*:/gi, '')
    // Remove data: URLs that could be used for XSS
    .replace(/\s*data\s*:/gi, '')
}

export function sanitizeRedirectTarget(location: string, baseUrl: string): string | null {
  try {
    const base = new URL(baseUrl)
    const target = new URL(location, base)
    // Only allow http/https protocols and same origin to prevent open redirect
    if ((target.protocol !== 'http:' && target.protocol !== 'https:') || target.origin !== base.origin) {
      return null
    }
    // Encode any pathname components that might contain dangerous characters
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
  // Validate and sanitize the redirect location to prevent open redirect and XSS
  const safeLocation = sanitizeRedirectTarget(location, baseUrl)
  if (!safeLocation) {
    // Invalid redirect target, don't redirect
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

export async function fetch(url: string, options?: RequestOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const opts: RequestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options?.method || 'GET',
      headers: options?.headers,
    }
    const protocol = urlObj.protocol === 'https:' ? require('node:https') : require('node:http')
    const req = protocol.request(opts, (res) => {
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
