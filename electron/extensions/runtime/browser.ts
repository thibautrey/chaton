import crypto from 'node:crypto'
import electron from 'electron'
import type { BrowserWindow as ElectronBrowserWindow } from 'electron'
import type { ExtensionHostCallResult } from './types.js'

const { BrowserWindow } = electron

const BROWSER_WIDTH_MIN = 320
const BROWSER_WIDTH_MAX = 3840
const BROWSER_HEIGHT_MIN = 240
const BROWSER_HEIGHT_MAX = 2160
const BROWSER_ACTION_TIMEOUT_MAX_MS = 30_000
const BROWSER_SNAPSHOT_MAX_ITEMS = 200
const BROWSER_SELECTOR_MAX_LENGTH = 2000
const BROWSER_ELEMENT_ID_MAX_LENGTH = 128
const BROWSER_TEXT_INPUT_MAX_LENGTH = 65_536
const BROWSER_WAIT_TEXT_MAX_LENGTH = 2000
const BROWSER_USER_AGENT_MAX_LENGTH = 512
const BROWSER_KEY_MAX_LENGTH = 64

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

function getPayloadObject(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  return payload as Record<string, unknown>
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

function normalizeOptionalInteger(
  payload: Record<string, unknown>,
  field: string,
  defaultValue: number,
  min: number,
  max: number,
): { ok: true; value: number } | { ok: false; message: string } {
  const value = payload[field]
  if (value === undefined || value === null) {
    return { ok: true, value: defaultValue }
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
    return { ok: false, message: `${field} must be a finite integer from ${min} to ${max}` }
  }
  if (value < min || value > max) {
    return { ok: false, message: `${field} must be from ${min} to ${max}` }
  }
  return { ok: true, value }
}

function normalizeOptionalTrimmedString(
  payload: Record<string, unknown>,
  field: string,
  maxLength: number,
): { ok: true; value: string } | { ok: false; message: string } {
  const value = payload[field]
  if (value === undefined || value === null) {
    return { ok: true, value: '' }
  }
  if (typeof value !== 'string') {
    return { ok: false, message: `${field} must be a string` }
  }
  const trimmed = value.trim()
  if (trimmed.length > maxLength) {
    return { ok: false, message: `${field} must be at most ${maxLength} characters` }
  }
  return { ok: true, value: trimmed }
}

function normalizeRequiredString(
  payload: Record<string, unknown>,
  field: string,
  maxLength: number,
  options: { trim: boolean },
): { ok: true; value: string } | { ok: false; message: string } {
  const value = payload[field]
  if (typeof value !== 'string') {
    return { ok: false, message: `${field} must be a string` }
  }
  const normalized = options.trim ? value.trim() : value
  if (!normalized) {
    return { ok: false, message: `${field} is required` }
  }
  if (normalized.length > maxLength) {
    return { ok: false, message: `${field} must be at most ${maxLength} characters` }
  }
  return { ok: true, value: normalized }
}

/**
 * Wait for load to complete with timeout.
 * For loadURL calls: set up listeners BEFORE calling loadURL and pass the
 * resulting promise here so we avoid the race where load finishes before
 * listeners are attached.
 * For non-navigation actions (click, press): use a short timeout since
 * a navigation may or may not occur.
 */
function createLoadPromise(window: ElectronBrowserWindow, timeoutMs = 30_000): Promise<void> {
  const wc = window.webContents
  return new Promise<void>((resolve) => {
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      wc.removeListener('did-finish-load', done)
      wc.removeListener('did-fail-load', done)
      clearTimeout(timer)
      resolve()
    }
    wc.once('did-finish-load', done)
    wc.once('did-fail-load', done)
    const timer = setTimeout(done, timeoutMs)
  })
}

/** Wait briefly for a possible navigation after click/press/reload. */
async function waitForPossibleNavigation(window: ElectronBrowserWindow, timeoutMs = 2000): Promise<void> {
  return createLoadPromise(window, timeoutMs)
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
  const direct = normalizeOptionalTrimmedString(payload, 'selector', BROWSER_SELECTOR_MAX_LENGTH)
  if (!direct.ok) return direct
  if (direct.value) return { ok: true as const, value: direct.value }
  const elementId = normalizeOptionalTrimmedString(payload, 'elementId', BROWSER_ELEMENT_ID_MAX_LENGTH)
  if (!elementId.ok) return elementId
  if (!elementId.value) return { ok: true as const, value: '' }
  const snapshot = session.lastSnapshot
  if (!snapshot) return { ok: true as const, value: '' }
  const found = [...snapshot.forms, ...snapshot.controls, ...snapshot.links].find((item) => item.id === elementId.value)
  return { ok: true as const, value: found?.selector ?? '' }
}

function touch(session: BrowserSession, snapshot?: BrowserSnapshot | null) {
  session.updatedAt = new Date().toISOString()
  if (snapshot !== undefined) session.lastSnapshot = snapshot
}

export async function browserOpen(payload: unknown): Promise<ExtensionHostCallResult> {
  const p = getPayloadObject(payload)
  if (!p) return fail('invalid_args', 'payload object expected')
  const url = ensureUrl(p.url)
  if (!url) return fail('invalid_args', 'url must be a valid http or https URL')

  const existing = getSession(p.sessionId)
  if (existing) {
    const loaded = createLoadPromise(existing.window)
    await existing.window.loadURL(url)
    await loaded
    touch(existing)
    return ok({ sessionId: existing.id, url, reused: true })
  }

  const widthResult = normalizeOptionalInteger(p, 'width', 1280, BROWSER_WIDTH_MIN, BROWSER_WIDTH_MAX)
  if (!widthResult.ok) return fail('invalid_args', widthResult.message)
  const heightResult = normalizeOptionalInteger(p, 'height', 900, BROWSER_HEIGHT_MIN, BROWSER_HEIGHT_MAX)
  if (!heightResult.ok) return fail('invalid_args', heightResult.message)
  const userAgentResult = normalizeOptionalTrimmedString(p, 'userAgent', BROWSER_USER_AGENT_MAX_LENGTH)
  if (!userAgentResult.ok) return fail('invalid_args', userAgentResult.message)
  const width = widthResult.value
  const height = heightResult.value
  const userAgent = userAgentResult.value
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
    const loaded = createLoadPromise(window)
    await window.loadURL(url)
    await loaded
    return ok({ sessionId, url, reused: false })
  } catch (error) {
    sessions.delete(sessionId)
    try { window.destroy() } catch {}
    return fail('internal', error instanceof Error ? error.message : String(error))
  }
}

export async function browserNavigate(payload: unknown): Promise<ExtensionHostCallResult> {
  const p = getPayloadObject(payload)
  if (!p) return fail('invalid_args', 'payload object expected')
  const session = getSession(p.sessionId)
  if (!session) return fail('not_found', 'browser session not found')
  const url = ensureUrl(p.url)
  if (!url) return fail('invalid_args', 'url must be a valid http or https URL')
  const loaded = createLoadPromise(session.window)
  await session.window.loadURL(url)
  await loaded
  touch(session, null)
  return ok({ sessionId: session.id, url })
}

export async function browserBack(payload: unknown): Promise<ExtensionHostCallResult> {
  const p = getPayloadObject(payload)
  if (!p) return fail('invalid_args', 'payload object expected')
  const session = getSession(p.sessionId)
  if (!session) return fail('not_found', 'browser session not found')
  if (session.window.webContents.navigationHistory.canGoBack()) {
    const loaded = createLoadPromise(session.window)
    session.window.webContents.navigationHistory.goBack()
    await loaded
  }
  touch(session, null)
  return ok({ sessionId: session.id, url: session.window.webContents.getURL() })
}

export async function browserForward(payload: unknown): Promise<ExtensionHostCallResult> {
  const p = getPayloadObject(payload)
  if (!p) return fail('invalid_args', 'payload object expected')
  const session = getSession(p.sessionId)
  if (!session) return fail('not_found', 'browser session not found')
  if (session.window.webContents.navigationHistory.canGoForward()) {
    const loaded = createLoadPromise(session.window)
    session.window.webContents.navigationHistory.goForward()
    await loaded
  }
  touch(session, null)
  return ok({ sessionId: session.id, url: session.window.webContents.getURL() })
}

export async function browserReload(payload: unknown): Promise<ExtensionHostCallResult> {
  const p = getPayloadObject(payload)
  if (!p) return fail('invalid_args', 'payload object expected')
  const session = getSession(p.sessionId)
  if (!session) return fail('not_found', 'browser session not found')
  const loaded = createLoadPromise(session.window)
  session.window.webContents.reload()
  await loaded
  touch(session, null)
  return ok({ sessionId: session.id, url: session.window.webContents.getURL() })
}

export async function browserSnapshot(payload: unknown): Promise<ExtensionHostCallResult> {
  const p = getPayloadObject(payload)
  if (!p) return fail('invalid_args', 'payload object expected')
  const session = getSession(p.sessionId)
  if (!session) return fail('not_found', 'browser session not found')
  const includeHtml = p.includeHtml === true
  const maxItemsResult = normalizeOptionalInteger(p, 'maxItems', 50, 1, BROWSER_SNAPSHOT_MAX_ITEMS)
  if (!maxItemsResult.ok) return fail('invalid_args', maxItemsResult.message)
  const maxItems = maxItemsResult.value
  const snapshot = await executeJavaScript<BrowserSnapshot>(session, buildSnapshotScript(includeHtml, maxItems))
  touch(session, snapshot)
  return ok({ sessionId: session.id, snapshot })
}

export async function browserClick(payload: unknown): Promise<ExtensionHostCallResult> {
  const p = getPayloadObject(payload)
  if (!p) return fail('invalid_args', 'payload object expected')
  const session = getSession(p.sessionId)
  if (!session) return fail('not_found', 'browser session not found')
  const selectorResult = resolveSelector(session, p)
  if (!selectorResult.ok) return fail('invalid_args', selectorResult.message)
  const selector = selectorResult.value
  if (!selector) return fail('invalid_args', 'selector or elementId is required')
  const timeoutResult = normalizeOptionalInteger(p, 'timeoutMs', 5000, 0, BROWSER_ACTION_TIMEOUT_MAX_MS)
  if (!timeoutResult.ok) return fail('invalid_args', timeoutResult.message)
  const timeoutMs = timeoutResult.value
  const result = await executeJavaScript<{ ok: boolean; message?: string }>(session, `(() => {
    const selector = ${JSON.stringify(selector)};
    const timeoutMs = ${timeoutMs};
    return new Promise((resolve) => {
      const deadline = Date.now() + timeoutMs;
      const tick = () => {
        let element = null;
        try { element = document.querySelector(selector); }
        catch { resolve({ ok: false, message: 'invalid selector: ' + selector }); return; }
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
  await waitForPossibleNavigation(session.window)
  touch(session, null)
  return ok({ sessionId: session.id, selector, url: session.window.webContents.getURL() })
}

export async function browserType(payload: unknown): Promise<ExtensionHostCallResult> {
  const p = getPayloadObject(payload)
  if (!p) return fail('invalid_args', 'payload object expected')
  const session = getSession(p.sessionId)
  if (!session) return fail('not_found', 'browser session not found')
  const selectorResult = resolveSelector(session, p)
  if (!selectorResult.ok) return fail('invalid_args', selectorResult.message)
  const selector = selectorResult.value
  if (!selector) return fail('invalid_args', 'selector or elementId is required')
  const textResult = normalizeRequiredString(p, 'text', BROWSER_TEXT_INPUT_MAX_LENGTH, { trim: false })
  if (!textResult.ok) return fail('invalid_args', textResult.message)
  const text = textResult.value
  const result = await executeJavaScript<{ ok: boolean; message?: string }>(session, `(() => {
    const selector = ${JSON.stringify(selector)};
    const text = ${JSON.stringify(text)};
    let element = null;
    try { element = document.querySelector(selector); }
    catch { return { ok: false, message: 'invalid selector: ' + selector }; }
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
  const p = getPayloadObject(payload)
  if (!p) return fail('invalid_args', 'payload object expected')
  const session = getSession(p.sessionId)
  if (!session) return fail('not_found', 'browser session not found')
  const keyResult = normalizeRequiredString(p, 'key', BROWSER_KEY_MAX_LENGTH, { trim: true })
  if (!keyResult.ok) return fail('invalid_args', keyResult.message)
  const key = keyResult.value
  const selectorResult = resolveSelector(session, p)
  if (!selectorResult.ok) return fail('invalid_args', selectorResult.message)
  const selector = selectorResult.value
  const result = await executeJavaScript<{ ok: boolean; message?: string }>(session, `(() => {
    const selector = ${JSON.stringify(selector)};
    const key = ${JSON.stringify(key)};
    let target = document.activeElement || document.body;
    if (selector) {
      try { target = document.querySelector(selector); }
      catch { return { ok: false, message: 'invalid selector: ' + selector }; }
    }
    if (target instanceof HTMLElement) target.focus();
    const down = new KeyboardEvent('keydown', { key, bubbles: true });
    const up = new KeyboardEvent('keyup', { key, bubbles: true });
    (target || document.body).dispatchEvent(down);
    (target || document.body).dispatchEvent(up);
    return { ok: true };
  })()`)
  if (!result.ok) return fail('not_found', result.message || 'unable to press key')
  await waitForPossibleNavigation(session.window)
  touch(session, null)
  return ok({ sessionId: session.id, key, selector: selector || null })
}

export async function browserWait(payload: unknown): Promise<ExtensionHostCallResult> {
  const p = getPayloadObject(payload)
  if (!p) return fail('invalid_args', 'payload object expected')
  const session = getSession(p.sessionId)
  if (!session) return fail('not_found', 'browser session not found')
  const timeoutResult = normalizeOptionalInteger(p, 'timeoutMs', 3000, 0, BROWSER_ACTION_TIMEOUT_MAX_MS)
  if (!timeoutResult.ok) return fail('invalid_args', timeoutResult.message)
  const timeoutMs = timeoutResult.value
  const selectorResult = normalizeOptionalTrimmedString(p, 'selector', BROWSER_SELECTOR_MAX_LENGTH)
  if (!selectorResult.ok) return fail('invalid_args', selectorResult.message)
  const textResult = normalizeOptionalTrimmedString(p, 'text', BROWSER_WAIT_TEXT_MAX_LENGTH)
  if (!textResult.ok) return fail('invalid_args', textResult.message)
  const selector = selectorResult.value
  const text = textResult.value
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
        let selectorOk = true;
        if (selector) {
          try { selectorOk = !!document.querySelector(selector); }
          catch { resolve({ ok: false, message: 'invalid selector: ' + selector }); return; }
        }
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
  const p = getPayloadObject(payload)
  if (!p) return fail('invalid_args', 'payload object expected')
  const session = getSession(p.sessionId)
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
