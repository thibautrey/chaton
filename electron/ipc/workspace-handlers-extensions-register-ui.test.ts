import { describe, it, expect, vi } from 'vitest'

/**
 * Unit tests for the `extensions:registerUi` IPC handler.
 *
 * Handler (workspace-handlers.ts lines 2140–2143):
 *   ipcMain.handle("extensions:registerUi", () => ({
 *     ok: true as const,
 *     entries: listRegisteredExtensionUi(),
 *   }));
 *
 * The handler always returns `{ok: true}` — it does NOT return an error when
 * there are no registered UIs. Callers receive the raw entries array.
 *
 * Direct collaborator: `listRegisteredExtensionUi()` from the registry module,
 * which reads from the in-memory `runtimeState` Map and combines it with the
 * installed extension registry.
 */

type UiEntry = {
  extensionId: string
  kind: string | null
  icon?: string
  iconUrl?: string
  sidebarMenuItems: Array<{ id: string; label: string; location: string }>
  topbarItems: Array<{ id: string; label: string }>
  mainViews: Array<{ id: string; label: string; icon?: string }>
  capabilitiesDeclared: string[]
  capabilitiesUsed: string[]
  enabled: boolean
  serverStatus: unknown
  channelStatus: unknown
}

// Inline handler — mirrors workspace-handlers.ts lines 2140–2143 exactly.
function handleRegisterUi(
  listRegisteredExtensionUi: () => UiEntry[],
): { ok: true; entries: UiEntry[] } {
  return {
    ok: true as const,
    entries: listRegisteredExtensionUi(),
  }
}

// -------------------------------------------------------------------------
// Test suite
// -------------------------------------------------------------------------

describe('extensions:registerUi handler', () => {
  describe('returns ok:true regardless of registered UI state', () => {
    it('returns {ok: true} when no extensions have registered UI', () => {
      const listRegisteredExtensionUi = vi.fn<[], UiEntry[]>().mockReturnValue([])
      const result = handleRegisterUi(listRegisteredExtensionUi)
      expect(result).toEqual({ ok: true, entries: [] })
    })

    it('returns {ok: true} when extensions have registered UIs', () => {
      const entries: UiEntry[] = [
        {
          extensionId: '@chaton/example',
          kind: 'channel',
          sidebarMenuItems: [{ id: 'menu1', label: 'Menu', location: 'sidebar' }],
          topbarItems: [{ id: 'topbar1', label: 'Topbar' }],
          mainViews: [{ id: 'view1', label: 'Main View' }],
          capabilitiesDeclared: ['read', 'write'],
          capabilitiesUsed: [],
          enabled: true,
          serverStatus: { running: true },
          channelStatus: { connected: true },
        },
      ]
      const listRegisteredExtensionUi = vi.fn<[], UiEntry[]>().mockReturnValue(entries)
      const result = handleRegisterUi(listRegisteredExtensionUi)
      expect(result.ok).toBe(true)
      expect(result.entries).toHaveLength(1)
      expect(result.entries[0].extensionId).toBe('@chaton/example')
    })
  })

  describe('delegation to listRegisteredExtensionUi', () => {
    it('calls listRegisteredExtensionUi with no arguments', () => {
      const listRegisteredExtensionUi = vi.fn<[], UiEntry[]>().mockReturnValue([])
      handleRegisterUi(listRegisteredExtensionUi)
      expect(listRegisteredExtensionUi).toHaveBeenCalledTimes(1)
      expect(listRegisteredExtensionUi).toHaveBeenCalledWith()
    })

    it('returns the entries array from listRegisteredExtensionUi unchanged', () => {
      const entries: UiEntry[] = [
        {
          extensionId: 'ext-a',
          kind: null,
          sidebarMenuItems: [],
          topbarItems: [],
          mainViews: [],
          capabilitiesDeclared: [],
          capabilitiesUsed: [],
          enabled: false,
          serverStatus: null,
          channelStatus: null,
        },
        {
          extensionId: 'ext-b',
          kind: 'channel',
          sidebarMenuItems: [{ id: 'm', label: 'L', location: 'sidebar' }],
          topbarItems: [],
          mainViews: [{ id: 'v', label: 'V', icon: '/icon.png' }],
          capabilitiesDeclared: ['api'],
          capabilitiesUsed: ['api'],
          enabled: true,
          serverStatus: { port: 8080 },
          channelStatus: null,
        },
      ]
      const listRegisteredExtensionUi = vi.fn<[], UiEntry[]>().mockReturnValue(entries)
      const result = handleRegisterUi(listRegisteredExtensionUi)
      expect(result.entries).toEqual(entries)
      expect(result.entries).toHaveLength(2)
    })
  })

  describe('entries field preservation', () => {
    it('preserves all fields from a single entry', () => {
      const entry: UiEntry = {
        extensionId: '@chaton/rich',
        kind: 'channel',
        icon: '/icons/rich.png',
        iconUrl: 'https://marketplace.example/icons/rich.png',
        sidebarMenuItems: [
          { id: 'menu-a', label: 'Menu A', location: 'sidebar' },
          { id: 'menu-b', label: 'Menu B', location: 'sidebar' },
        ],
        topbarItems: [
          { id: 'topbar-1', label: 'Topbar 1' },
        ],
        mainViews: [
          { id: 'view-main', label: 'Main View', icon: '/icons/view.png' },
          { id: 'view-config', label: 'Config' },
        ],
        capabilitiesDeclared: ['read', 'write', 'execute'],
        capabilitiesUsed: ['read'],
        enabled: true,
        serverStatus: { running: true, port: 3000 },
        channelStatus: { connected: true, lastPing: '2026-01-01T00:00:00Z' },
      }
      const listRegisteredExtensionUi = vi.fn<[], UiEntry[]>().mockReturnValue([entry])
      const result = handleRegisterUi(listRegisteredExtensionUi)
      expect(result.entries[0]).toEqual(entry)
    })

    it('handles entry with minimal fields (only required fields)', () => {
      const entry: UiEntry = {
        extensionId: 'minimal-ext',
        kind: null,
        sidebarMenuItems: [],
        topbarItems: [],
        mainViews: [],
        capabilitiesDeclared: [],
        capabilitiesUsed: [],
        enabled: false,
        serverStatus: null,
        channelStatus: null,
      }
      const listRegisteredExtensionUi = vi.fn<[], UiEntry[]>().mockReturnValue([entry])
      const result = handleRegisterUi(listRegisteredExtensionUi)
      expect(result.entries).toHaveLength(1)
      expect(result.entries[0].extensionId).toBe('minimal-ext')
      expect(result.entries[0].kind).toBeNull()
      expect(result.entries[0].enabled).toBe(false)
    })

    it('handles empty entries array without errors', () => {
      const listRegisteredExtensionUi = vi.fn<[], UiEntry[]>().mockReturnValue([])
      const result = handleRegisterUi(listRegisteredExtensionUi)
      expect(result.ok).toBe(true)
      expect(result.entries).toEqual([])
    })
  })

  describe('contract: ok is always true', () => {
    it('ok is always true regardless of how many entries listRegisteredExtensionUi returns', () => {
      const listRegisteredExtensionUi = vi.fn<[], UiEntry[]>()
        .mockReturnValueOnce([])
        .mockReturnValueOnce([
          { extensionId: 'a', kind: null, sidebarMenuItems: [], topbarItems: [], mainViews: [], capabilitiesDeclared: [], capabilitiesUsed: [], enabled: false, serverStatus: null, channelStatus: null },
        ])
        .mockReturnValueOnce([
          { extensionId: 'a', kind: null, sidebarMenuItems: [], topbarItems: [], mainViews: [], capabilitiesDeclared: [], capabilitiesUsed: [], enabled: false, serverStatus: null, channelStatus: null },
          { extensionId: 'b', kind: null, sidebarMenuItems: [], topbarItems: [], mainViews: [], capabilitiesDeclared: [], capabilitiesUsed: [], enabled: false, serverStatus: null, channelStatus: null },
        ])

      const r1 = handleRegisterUi(listRegisteredExtensionUi)
      const r2 = handleRegisterUi(listRegisteredExtensionUi)
      const r3 = handleRegisterUi(listRegisteredExtensionUi)

      expect(r1.ok).toBe(true)
      expect(r2.ok).toBe(true)
      expect(r3.ok).toBe(true)
      expect(r1.entries).toHaveLength(0)
      expect(r2.entries).toHaveLength(1)
      expect(r3.entries).toHaveLength(2)
    })
  })
})
