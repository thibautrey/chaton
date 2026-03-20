import http from 'node:http'
import { maxJsonBodyBytes } from './config.ts'

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

export function json(
  response: http.ServerResponse,
  statusCode: number,
  payload: unknown,
): void {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(payload))
}

export function html(response: http.ServerResponse, statusCode: number, markup: string): void {
  response.writeHead(statusCode, {
    'content-type': 'text/html; charset=utf-8',
  })
  response.end(markup)
}

export function redirect(response: http.ServerResponse, location: string): void {
  response.writeHead(302, { location })
  response.end()
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
