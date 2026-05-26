import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { isPathInsideRoot } from './path-safety.js'

describe('isPathInsideRoot', () => {
  it('allows the root itself and nested files', () => {
    const root = path.join('/tmp', 'chaton-extension')
    expect(isPathInsideRoot(root, root)).toBe(true)
    expect(isPathInsideRoot(root, path.join(root, 'dist', 'index.html'))).toBe(true)
  })

  it('rejects sibling paths with the same prefix', () => {
    const root = path.join('/tmp', 'chaton-extension')
    expect(isPathInsideRoot(root, path.join('/tmp', 'chaton-extension-malicious', 'index.html'))).toBe(false)
  })

  it('rejects parent traversal outside the root', () => {
    const root = path.join('/tmp', 'chaton-extension')
    expect(isPathInsideRoot(root, path.join(root, '..', 'outside.html'))).toBe(false)
  })
})
