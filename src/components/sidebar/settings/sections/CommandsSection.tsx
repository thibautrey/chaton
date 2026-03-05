import type { PiCommandResult } from '@/features/workspace/types'

import { CommandOutputPanel } from '@/components/sidebar/settings/CommandOutputPanel'

export function CommandsSection({
  lastResult,
}: {
  lastResult: PiCommandResult | null
}) {
  return (
    <section className="settings-card">
      {/* <div className="settings-actions-grid">
        <button type="button" className="settings-action" onClick={() => onRun('list')}>pi list</button>
        <button type="button" className="settings-action" onClick={() => onRun('list-models')}>pi --list-models</button>
        <button type="button" className="settings-action" onClick={() => onRun('update')}>pi update</button>
        <button type="button" className="settings-action" onClick={() => onRun('install', { source: 'npm:pi-context' })}>pi install</button>
        <button type="button" className="settings-action" onClick={() => onRun('remove', { source: 'npm:pi-context' })}>pi remove</button>
        <button type="button" className="settings-action" onClick={() => onRun('config')}>pi config</button>
      </div> */}
      <CommandOutputPanel result={lastResult} />
    </section>
  )
}
