import crypto from 'node:crypto'
import electron from 'electron'
import type { BrowserWindow as ElectronBrowserWindow } from 'electron'
import type { ExtensionHostCallResult } from './types.js'

const { BrowserWindow } = electron

type BrowserSession = {
  id: string
  window: ElectronBrowserWindow
  lastSnapshot: BrowserSnapshot | null
  createdAt: string
  updatedAt: string
}

type SnapshotItem = {
  id: string
  selector: string
  role: string
  tagName: string
  text?: string
  ariaLabel?: string
  placeholder?: string
  href?: string
  type?: string
}

type BrowserSnapshot = {
  url: string
  title: string
  text: string
  forms: SnapshotItem[]
  controls: SnapshotItem[]
  links: SnapshotItem[]
  html?: string
  capturedAt: string
}

const sessions = new Map<string, BrowserSession>()

function ok(data?: unknown): ExtensionHostCallResult {
  return { ok: true, data }
}

function fail(code: 'invalid_args' | 'not_found' | 'internal', message: string): ExtensionHostCallResult {
  return { ok: false, error: { code, message } }
}

function getSession(sessionId: unknown): BrowserSession | null {
  if (typeof sessionId !== 'string' || !sessionId.trim()) return null
  return sessions.get(sessionId.trim()) ?? null
}

function ensureUrl(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const url = new URL(value.trim())
    if (!['http:', 'https:'].includes(url.protocol)) return null
    return url.toString()
  } catch {
    return null
  }
}

async function waitForLoad(window: ElectronBrowserWindow) {
  const wc = window.webContents
  if (!wc.isLoadingMainFrame()) return
  await new Promise<void>((resolve) => {
    const done = () => {
      wc.removeListener('did-finish-load', done)
      wc.removeListener('did-fail-load', done)
      resolve()
    }
    wc.once('did-finish-load', done)
    wc.once('did-fail-load', done)
  })
}

async function executeJavaScript<T>(session: BrowserSession, source: string): Promise<T> {
  return session.window.webContents.executeJavaScript(source, true) as Promise<T>
}

function buildSnapshotScript(includeHtml: boolean, maxItems: number) {
  return `(() => {
    const maxItems = ${Math.max(1, Math.min(maxItems, 200))};
    const isVisible = (el) => {
      if (!(el instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const selectorFor = (el) => {
      if (!(el instanceof Element)) return '';
      if (el.id) return '#' + CSS.escape(el.id);
      const parts = [];
      let current = el;
      while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 4) {
        let part = current.tagName.toLowerCase();
        if (current.classList && current.classList.length > 0) {
          part += '.' + Array.from(current.classList).slice(0, 2).map((c) => CSS.escape(c)).join('.');
        }
        const parent = current.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children).filter((child) => child.tagName === current.tagName);
          if (siblings.length > 1) part += ':nth-of-type(' + (siblings.indexOf(current) + 1) + ')';
        }
        parts.unshift(part);
        current = current.parentElement;
      }
      return parts.join(' > ');
    };
    const textFor = (el) => ((el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim()).slice(0, 500);
    let counter = 0;
    const toItem = (el, role) => ({
      id: 'el-' + (++counter),
      selector: selectorFor(el),
      role,
      tagName: el.tagName.toLowerCase(),
      text: textFor(el),
      ariaLabel: el.getAttribute('aria-label') || undefined,
      placeholder: 'placeholder' in el ? el.placeholder || undefined : undefined,
      href: 'href' in el ? el.href || undefined : undefined,
      type: 'type' in el ? el.type || undefined : undefined,
    });
    const controls = Array.from(document.querySelectorAll('button, input, textarea, select, [role="button"], [contenteditable="true"]'))
      .filter(isVisible)
      .slice(0, maxItems)
      .map((el) => toItem(el, 'control'));
    const forms = Array.from(document.querySelectorAll('input, textarea, select, [contenteditable="true"]'))
      .filter(isVisible)
      .slice(0, maxItems)
      .map((el) => toItem(el, 'form'));
    const links = Array.from(document.querySelectorAll('a[href]'))
      .filter(isVisible)
      .slice(0, maxItems)
      .map((el) => toItem(el, 'link'));
    return {
      url: location.href,
      title: document.title || '',
      text: (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 12000),
      forms,
      controls,
      links,
      html: ${includeHtml ? '(document.documentElement?.outerHTML || "").slice(0, 50000)' : 'undefined'},
      capturedAt: new Date().toISOString(),
    };
  })()`
}

function resolveSelector(session: BrowserSession, payload: Record<string, unknown>) {
  const direct = typeof payload.selector === 'string' && payload.selector.trim() ? payload.selector.trim() : ''
  if (direct) return direct
  const elementId = typeof payload.elementId === 'string' && payload.elementId.trim() ? payload.elementId.trim() : ''
  if (!elementId) return ''
  const snapshot = session.lastSnapshot
  if (!snapshot) return ''
  const found = [...snapshot.forms, ...snapshot.controls, ...snapshot.links].find((item) => item.id === elementId)
  return found?.selector ?? ''
}

function touch(session: BrowserSession, snapshot?: BrowserSnapshot | null) {
  session.updatedAt = new Date().toISOString()
  if (snapshot !== undefined) session.lastSnapshot = snapshot
}

export async function browserOpen(payload: unknown): Promise<ExtensionHostCallResult> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return fail('invalid_args', 'payload object expected')
  const p = payload as Record<string, unknown>
  const url = ensureUrl(p.url)
  if (!url) return fail('invalid_args', 'url must be a valid http or https URL')

  const existing = getSession(p.sessionId)
  if (existing) {
    await existing.window.loadURL(url)
    await waitForLoad(existing.window)
    touch(existing)
    return ok({ sessionId: existing.id, url, reused: true })
  }

  const width = typeof p.width === 'number' && Number.isFinite(p.width) ? Math.max(320, Math.floor(p.width)) : 1280
  const height = typeof p.height === 'number' && Number.isFinite(p.height) ? Math.max(240, Math.floor(p.height)) : 900
  const sessionId = crypto.randomUUID()
  const window = new BrowserWindow({
    width,
    height,
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  const userAgent = typeof p.userAgent === 'string' && p.userAgent.trim() ? p.userAgent.trim() : ''
  if (userAgent) window.webContents.setUserAgent(userAgent)

  const session: BrowserSession = {
    id: sessionId,
    window,
    lastSnapshot: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  sessions.set(sessionId, session)

  window.on('closed', () => {
    sessions.delete(sessionId)
  })

  try {
    await window.loadURL(url)
    await waitForLoad(window)
    return ok({ sessionId, url, reused: false })
  } catch (error) {
    sessions.delete(sessionId)
    try { window.destroy() } catch {}
    return fail('internal', error instanceof Error ? error.message : String(error))
  }
}

export async function browserNavigate(payload: unknown): Promise<ExtensionHostCallResult> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return fail('invalid_args', 'payload object expected')
  const p = payload as Record<string, unknown>
  const session = getSession(p.sessionId)
  if (!session) return fail('not_found', 'browser session not found')
  const url = ensureUrl(p.url)
  if (!url) return fail('invalid_args', 'url must be a valid http or https URL')
  await session.window.loadURL(url)
  await waitForLoad(session.window)
  touch(session, null)
  return ok({ sessionId: session.id, url })
}

export async function browserBack(payload: unknown): Promise<ExtensionHostCallResult> {
  const session = getSession((payload as Record<string, unknown> | null)?.sessionId)
  if (!session) return fail('not_found', 'browser session not found')
  if (session.window.webContents.navigationHistory.canGoBack()) {
    session.window.webContents.navigationHistory.goBack()
    await waitForLoad(session.window)
  }
  touch(session, null)
  return ok({ sessionId: session.id, url: session.window.webContents.getURL() })
}

export async function browserForward(payload: unknown): Promise<ExtensionHostCallResult> {
  const session = getSession((payload as Record<string, unknown> | null)?.sessionId)
  if (!session) return fail('not_found', 'browser session not found')
  if (session.window.webContents.navigationHistory.canGoForward()) {
    session.window.webContents.navigationHistory.goForward()
    await waitForLoad(session.window)
  }
  touch(session, null)
  return ok({ sessionId: session.id, url: session.window.webContents.getURL() })
}

export async function browserReload(payload: unknown): Promise<ExtensionHostCallResult> {
  const session = getSession((payload as Record<string, unknown> | null)?.sessionId)
  if (!session) return fail('not_found', 'browser session not found')
  session.window.webContents.reload()
  await waitForLoad(session.window)
  touch(session, null)
  return ok({ sessionId: session.id, url: session.window.webContents.getURL() })
}

export async function browserSnapshot(payload: unknown): Promise<ExtensionHostCallResult> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return fail('invalid_args', 'payload object expected')
  const p = payload as Record<string, unknown>
  const session = getSession(p.sessionId)
  if (!session) return fail('not_found', 'browser session not found')
  const includeHtml = p.includeHtml === true
  const maxItems = typeof p.maxItems === 'number' && Number.isFinite(p.maxItems) ? Math.floor(p.maxItems) : 50
  const snapshot = await executeJavaScript<BrowserSnapshot>(session, buildSnapshotScript(includeHtml, maxItems))
  touch(session, snapshot)
  return ok({ sessionId: session.id, snapshot })
}

export async function browserClick(payload: unknown): Promise<ExtensionHostCallResult> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return fail('invalid_args', 'payload object expected')
  const p = payload as Record<string, unknown>
  const session = getSession(p.sessionId)
  if (!session) return fail('not_found', 'browser session not found')
  const selector = resolveSelector(session, p)
  if (!selector) return fail('invalid_args', 'selector or elementId is required')
  const timeoutMs = typeof p.timeoutMs === 'number' && Number.isFinite(p.timeoutMs) ? Math.max(0, Math.floor(p.timeoutMs)) : 5000
  const result = await executeJavaScript<{ ok: boolean; message?: string }>(session, `(() => {
    const selector = ${JSON.stringify(selector)};
    const timeoutMs = ${timeoutMs};
    return new Promise((resolve) => {
      const deadline = Date.now() + timeoutMs;
      const tick = () => {
        const element = document.querySelector(selector);
        if (element instanceof HTMLElement) {
          element.click();
          resolve({ ok: true });
          return;
        }
        if (Date.now() >= deadline) {
          resolve({ ok: false, message: 'element not found: ' + selector });
          return;
        }
        window.setTimeout(tick, 100);
      };
      tick();
    });
  })()`)
  if (!result.ok) return fail('not_found', result.message || 'element not found')
  await waitForLoad(session.window)
  touch(session, null)
  return ok({ sessionId: session.id, selector, url: session.window.webContents.getURL() })
}

export async function browserType(payload: unknown): Promise<ExtensionHostCallResult> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return fail('invalid_args', 'payload object expected')
  const p = payload as Record<string, unknown>
  const session = getSession(p.sessionId)
  if (!session) return fail('not_found', 'browser session not found')
  const selector = resolveSelector(session, p)
  if (!selector) return fail('invalid_args', 'selector or elementId is required')
  const text = typeof p.text === 'string' ? p.text : ''
  if (!text) return fail('invalid_args', 'text is required')
  const result = await executeJavaScript<{ ok: boolean; message?: string }>(session, `(() => {
    const selector = ${JSON.stringify(selector)};
    const text = ${JSON.stringify(text)};
    const element = document.querySelector(selector);
    if (!element) return { ok: false, message: 'element not found: ' + selector };
    element.focus();
    if ('value' in element) {
      element.value = text;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (element instanceof HTMLElement && element.isContentEditable) {
      element.innerText = text;
      element.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      return { ok: false, message: 'element is not editable: ' + selector };
    }
    return { ok: true };
  })()`)
  if (!result.ok) return fail('not_found', result.message || 'unable to type into element')
  if (p.submit === true) {
    await session.window.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(selector)})?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`, true)
    await session.window.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(selector)})?.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }))`, true)
  }
  touch(session, null)
  return ok({ sessionId: session.id, selector, textLength: text.length })
}

export async function browserPress(payload: unknown): Promise<ExtensionHostCallResult> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return fail('invalid_args', 'payload object expected')
  const p = payload as Record<string, unknown>
  const session = getSession(p.sessionId)
  if (!session) return fail('not_found', 'browser session not found')
  const key = typeof p.key === 'string' && p.key.trim() ? p.key.trim() : ''
  if (!key) return fail('invalid_args', 'key is required')
  const selector = resolveSelector(session, p)
  await executeJavaScript(session, `(() => {
    const selector = ${JSON.stringify(selector)};
    const key = ${JSON.stringify(key)};
    const target = selector ? document.querySelector(selector) : document.activeElement || document.body;
    if (target instanceof HTMLElement) target.focus();
    const down = new KeyboardEvent('keydown', { key, bubbles: true });
    const up = new KeyboardEvent('keyup', { key, bubbles: true });
    (target || document.body).dispatchEvent(down);
    (target || document.body).dispatchEvent(up);
    return true;
  })()`)
  await waitForLoad(session.window)
  touch(session, null)
  return ok({ sessionId: session.id, key, selector: selector || null })
}

export async function browserWait(payload: unknown): Promise<ExtensionHostCallResult> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return fail('invalid_args', 'payload object expected')
  const p = payload as Record<string, unknown>
  const session = getSession(p.sessionId)
  if (!session) return fail('not_found', 'browser session not found')
  const timeoutMs = typeof p.timeoutMs === 'number' && Number.isFinite(p.timeoutMs) ? Math.max(0, Math.floor(p.timeoutMs)) : 3000
  const selector = typeof p.selector === 'string' && p.selector.trim() ? p.selector.trim() : ''
  const text = typeof p.text === 'string' && p.text.trim() ? p.text.trim() : ''
  if (!selector && !text) {
    await new Promise((resolve) => setTimeout(resolve, timeoutMs))
    touch(session)
    return ok({ sessionId: session.id, waitedMs: timeoutMs })
  }
  const result = await executeJavaScript<{ ok: boolean; message?: string }>(session, `(() => {
    const selector = ${JSON.stringify(selector)};
    const text = ${JSON.stringify(text)};
    const timeoutMs = ${timeoutMs};
    return new Promise((resolve) => {
      const deadline = Date.now() + timeoutMs;
      const tick = () => {
        const selectorOk = !selector || !!document.querySelector(selector);
        const textOk = !text || (document.body?.innerText || '').includes(text);
        if (selectorOk && textOk) {
          resolve({ ok: true });
          return;
        }
        if (Date.now() >= deadline) {
          resolve({ ok: false, message: 'condition not met before timeout' });
          return;
        }
        window.setTimeout(tick, 100);
      };
      tick();
    });
  })()`)
  if (!result.ok) return fail('not_found', result.message || 'wait condition not satisfied')
  touch(session)
  return ok({ sessionId: session.id, waitedMs: timeoutMs, selector: selector || null, text: text || null })
}

export function browserClose(payload: unknown): ExtensionHostCallResult {
  const session = getSession((payload as Record<string, unknown> | null)?.sessionId)
  if (!session) return fail('not_found', 'browser session not found')
  sessions.delete(session.id)
  try { session.window.destroy() } catch {}
  return ok({ sessionId: session.id, closed: true })
}

export function browserList(): ExtensionHostCallResult {
  return ok(Array.from(sessions.values()).map((session) => ({
    sessionId: session.id,
    url: session.window.webContents.getURL(),
    title: session.window.getTitle(),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  })))
}

export function closeAllBrowserSessions() {
  for (const session of sessions.values()) {
    try { session.window.destroy() } catch {}
  }
  sessions.clear()
}
