import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ProjectTerminalDialog } from './ProjectTerminalDialog'
import { workspaceIpc } from '@/services/ipc/workspace'

vi.mock('@/features/notifications/NotificationContext', () => ({
  useNotifications: () => ({ addNotification: vi.fn() }),
}))

vi.mock('@/services/ipc/workspace', () => ({
  workspaceIpc: {
    detectProjectCommands: vi.fn(),
    startProjectCommandTerminal: vi.fn(),
    readProjectCommandTerminal: vi.fn(),
    stopProjectCommandTerminal: vi.fn(),
  },
}))

const mockedWorkspaceIpc = vi.mocked(workspaceIpc)

describe('ProjectTerminalDialog', () => {
  it('updates a running terminal from the stop response without reading a removed run', async () => {
    mockedWorkspaceIpc.detectProjectCommands.mockResolvedValue({
      ok: true,
      projectType: 'node',
      commands: [
        {
          id: 'node:npm:dev',
          label: 'npm run dev',
          command: 'npm',
          args: ['run', 'dev'],
          source: 'package.json',
        },
      ],
      customCommands: [],
    })
    mockedWorkspaceIpc.startProjectCommandTerminal.mockResolvedValue({
      ok: true,
      runId: 'run-1',
      startedAt: '2026-05-26T00:00:00.000Z',
    })
    mockedWorkspaceIpc.readProjectCommandTerminal.mockResolvedValue({
      ok: true,
      run: {
        id: 'run-1',
        title: 'npm run dev · run-1',
        commandLabel: 'npm run dev',
        commandPreview: 'npm run dev',
        status: 'running',
        exitCode: null,
        startedAt: '2026-05-26T00:00:00.000Z',
        endedAt: null,
      },
      events: [
        { seq: 1, stream: 'meta', text: '$ npm run dev\n' },
      ],
    })
    mockedWorkspaceIpc.stopProjectCommandTerminal.mockResolvedValue({
      ok: true,
      run: {
        id: 'run-1',
        title: 'npm run dev · run-1',
        commandLabel: 'npm run dev',
        commandPreview: 'npm run dev',
        status: 'stopped',
        exitCode: null,
        startedAt: '2026-05-26T00:00:00.000Z',
        endedAt: '2026-05-26T00:00:02.000Z',
      },
      events: [
        { seq: 1, stream: 'meta', text: '$ npm run dev\n' },
        { seq: 2, stream: 'meta', text: '\nProcess stopped by user.\n' },
      ],
    })

    render(
      <ProjectTerminalDialog
        conversationId="conv-1"
        open
        onClose={vi.fn()}
        setConversationAccessMode={vi.fn()}
      />,
    )

    await screen.findByText('Detected type: node')
    fireEvent.click(screen.getByRole('button', { name: /run/i }))

    await screen.findByText('running')
    expect(mockedWorkspaceIpc.readProjectCommandTerminal).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: /stop/i }))

    await waitFor(() => expect(screen.getByText('stopped')).toBeTruthy())
    expect(screen.getByText(/Process stopped by user/)).toBeTruthy()
    expect(mockedWorkspaceIpc.stopProjectCommandTerminal).toHaveBeenCalledWith('run-1')
    expect(mockedWorkspaceIpc.readProjectCommandTerminal).toHaveBeenCalledTimes(1)
  })
})
