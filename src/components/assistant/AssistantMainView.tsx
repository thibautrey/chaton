import { useWorkspace } from '@/features/workspace/store'
import { AssistantOnboarding } from '@/components/assistant/AssistantOnboarding'
import { AssistantDashboard } from '@/components/assistant/AssistantDashboard'
import { AssistantMemoryView } from '@/components/assistant/AssistantMemoryView'
import { AssistantAutomationsView } from '@/components/assistant/AssistantAutomationsView'
import { AssistantChannelsView } from '@/components/assistant/AssistantChannelsView'
import { ChannelConversationsView } from '@/components/assistant/ChannelConversationsView'
import { AssistantExtensionSheet } from '@/components/assistant/AssistantExtensionSheet'

/**
 * Top-level router for assistant mode.
 * Shows onboarding if not completed, then routes to the active assistant view.
 * The extension sheet overlays any view when a channel config is opened.
 */
export function AssistantMainView() {
  const { state } = useWorkspace()

  if (!state.settings.assistantOnboardingCompleted) {
    return <AssistantOnboarding />
  }

  const view = (() => {
    switch (state.assistantView) {
      case 'memory':
        return <AssistantMemoryView />
      case 'automations':
        return <AssistantAutomationsView />
      case 'channels':
        return <AssistantChannelsView />
      case 'channel-conversations':
        return <ChannelConversationsView />
      case 'home':
      default:
        return <AssistantDashboard />
    }
  })()

  return (
    <div className="ad-main-wrapper">
      {view}
      <AssistantExtensionSheet />
    </div>
  )
}
