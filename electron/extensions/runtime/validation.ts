import { normalizeExtensionId } from './extension-id.js'
import type { ExtensionHostCallResult } from './types.js'

const MAX_TOPIC_LENGTH = 120
const MAX_API_NAME_LENGTH = 120
const MAX_VERSION_RANGE_LENGTH = 80
const MAX_CONTEXT_ID_LENGTH = 160
const MAX_VIEW_ID_LENGTH = 120

export function invalidArgs(message: string): ExtensionHostCallResult {
  return { ok: false, error: { code: 'invalid_args', message } }
}

export function normalizeRuntimeExtensionId(extensionId: string): string | ExtensionHostCallResult {
  const normalized = normalizeExtensionId(extensionId)
  return normalized ?? invalidArgs('invalid extensionId')
}

export function normalizeRuntimeTopic(topic: string | undefined): string | ExtensionHostCallResult {
  const value = String(topic ?? '').trim()
  if (!value) return invalidArgs('topic is required')
  if (value.length > MAX_TOPIC_LENGTH) return invalidArgs('topic too long')
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(value)) {
    return invalidArgs('topic can only contain letters, numbers, dots, underscores, colons and hyphens')
  }
  return value
}

export function normalizeRuntimeApiName(apiName: string): string | ExtensionHostCallResult {
  const value = String(apiName ?? '').trim()
  if (!value) return invalidArgs('apiName is required')
  if (value.length > MAX_API_NAME_LENGTH) return invalidArgs('apiName too long')
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(value)) {
    return invalidArgs('apiName can only contain letters, numbers, dots, underscores, colons and hyphens')
  }
  return value
}

export function normalizeRuntimeVersionRange(versionRange: string): string | ExtensionHostCallResult {
  const value = String(versionRange ?? '').trim()
  if (!value) return invalidArgs('versionRange is required')
  if (value.length > MAX_VERSION_RANGE_LENGTH) return invalidArgs('versionRange too long')
  if (!/^[a-zA-Z0-9*^~<>=|., _:-]+$/.test(value)) {
    return invalidArgs('versionRange contains unsupported characters')
  }
  return value
}

export function normalizeRuntimeContextId(value: string | undefined, field: string): string | undefined | ExtensionHostCallResult {
  if (typeof value === 'undefined') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (trimmed.length > MAX_CONTEXT_ID_LENGTH) return invalidArgs(`${field} too long`)
  if (!/^[a-zA-Z0-9._:-]+$/.test(trimmed)) {
    return invalidArgs(`${field} can only contain letters, numbers, dots, underscores, colons and hyphens`)
  }
  return trimmed
}

export function normalizeRuntimeViewId(viewId: string | undefined): string | ExtensionHostCallResult {
  const value = String(viewId ?? '').trim()
  if (!value) return invalidArgs('viewId is required')
  if (value.length > MAX_VIEW_ID_LENGTH) return invalidArgs('viewId too long')
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(value)) {
    return invalidArgs('viewId can only contain letters, numbers, dots, underscores, colons and hyphens')
  }
  return value
}

export function isErrorResult<T>(value: T | ExtensionHostCallResult): value is ExtensionHostCallResult {
  return typeof value === 'object' && value !== null && 'ok' in value && value.ok === false
}
