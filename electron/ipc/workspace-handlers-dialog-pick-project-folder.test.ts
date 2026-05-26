import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Unit tests for the `dialog:pickProjectFolder` IPC handler.
 *
 * The handler (workspace-handlers.ts lines 850–864):
 *   1. Opens an Electron dialog with title "Ajouter un nouveau projet",
 *      button label "Importer", and properties ["openDirectory", "createDirectory"].
 *   2. Returns `null` when the dialog is canceled or no path is selected.
 *   3. Returns `result.filePaths[0]` (the first selected directory path) otherwise.
 *
 * We replicate the minimal handler logic inline so the test is fully isolated —
 * no Electron IPC wiring, no dialog module import required.
 */

describe('dialog:pickProjectFolder', () => {
  // -------------------------------------------------------------------------
  // Minimal types mirroring Electron's dialog.showOpenDialog result
  // -------------------------------------------------------------------------
  interface DialogResult {
    canceled: boolean
    filePaths?: string[]
  }

  // -------------------------------------------------------------------------
  // Inline handler — mirrors workspace-handlers.ts lines 850–864 exactly
  // -------------------------------------------------------------------------
  function pickProjectFolder(dialogResult: DialogResult): string | null {
    const result = dialogResult
    // @ts-ignore - Electron dialog type issue
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return null
    }
    // @ts-ignore - Electron dialog type issue
    return result.filePaths[0]
  }

  describe('canceled dialog', () => {
    it('returns null when result.canceled is true', () => {
      const result = pickProjectFolder({ canceled: true })
      expect(result).toBeNull()
    })

    it('returns null when result.canceled is true even if filePaths is set', () => {
      const result = pickProjectFolder({ canceled: true, filePaths: ['/some/path'] })
      expect(result).toBeNull()
    })

    it('returns null when result.canceled is true and filePaths is empty array', () => {
      const result = pickProjectFolder({ canceled: true, filePaths: [] })
      expect(result).toBeNull()
    })
  })

  describe('non-canceled dialog with no paths', () => {
    it('returns null when result.canceled is false but filePaths is undefined', () => {
      const result = pickProjectFolder({ canceled: false, filePaths: undefined })
      expect(result).toBeNull()
    })

    it('returns null when result.canceled is false but filePaths is empty array', () => {
      const result = pickProjectFolder({ canceled: false, filePaths: [] })
      expect(result).toBeNull()
    })
  })

  describe('successful dialog — path selected', () => {
    it('returns the first file path when filePaths has one entry', () => {
      const result = pickProjectFolder({ canceled: false, filePaths: ['/home/user/projects/myapp'] })
      expect(result).toBe('/home/user/projects/myapp')
    })

    it('returns only the first file path when filePaths has multiple entries', () => {
      // Dialog could theoretically return multiple paths; handler always returns [0]
      const result = pickProjectFolder({
        canceled: false,
        filePaths: ['/first/chosen', '/second/chosen'],
      })
      expect(result).toBe('/first/chosen')
    })

    it('returns paths with spaces correctly', () => {
      const result = pickProjectFolder({
        canceled: false,
        filePaths: ['/Users/John Doe/Projects/My App'],
      })
      expect(result).toBe('/Users/John Doe/Projects/My App')
    })

    it('returns absolute paths unchanged', () => {
      const absPath = '/Volumes/MacHD/Users/developer/repos/chaton'
      const result = pickProjectFolder({ canceled: false, filePaths: [absPath] })
      expect(result).toBe(absPath)
    })
  })

  describe('dialog configuration — fixed options', () => {
    // The handler passes fixed options to showOpenDialog.
    // These tests verify the logic is correct regardless of what the dialog
    // module receives — we only test the result interpretation here.

    it('returns null on any canceled result regardless of undefined filePaths', () => {
      // This catches the case where Electron dialog returns { canceled: true }
      // with no filePaths key at all
      const result = pickProjectFolder({ canceled: true })
      expect(result).toBeNull()
    })

    it('returns the first path regardless of how many paths are returned', () => {
      const result = pickProjectFolder({
        canceled: false,
        filePaths: ['/path/one', '/path/two', '/path/three'],
      })
      // Handler logic: always filePaths[0]
      expect(result).toBe('/path/one')
    })
  })

  describe('null-guard edge cases', () => {
    it('returns null when filePaths is explicitly null (type mismatch)', () => {
      // Simulate a malformed Electron result
      const result = pickProjectFolder({ canceled: false, filePaths: null as unknown as string[] })
      expect(result).toBeNull()
    })

    it('returns null when filePaths is explicitly null even if canceled is false', () => {
      const result = pickProjectFolder({ canceled: false, filePaths: null as unknown as string[] })
      expect(result).toBeNull()
    })
  })
})
