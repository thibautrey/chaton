import { StatusHeader } from '@/components/assistant/StatusHeader'
import { ChannelsStatus, useChannelExtensions } from '@/components/assistant/ChannelsStatus'
import { QuickActions } from '@/components/assistant/QuickActions'
import { RecentActivity } from '@/components/assistant/RecentActivity'
import { MemoryInsights } from '@/components/assistant/MemoryInsights'
import { AutomationsSummary } from '@/components/assistant/AutomationsSummary'

export function AssistantDashboard() {
  const { channels, loading, connectedCount } = useChannelExtensions()

  return (
    <div className="ad-dashboard">
      <div className="ad-dashboard-scroll">
        <div className="ad-dashboard-content">
          <StatusHeader channelsConnected={connectedCount} />
          <QuickActions />

          <div className="ad-dashboard-grid">
            <ChannelsStatus channels={channels} loading={loading} />
            <RecentActivity />
          </div>

          <div className="ad-dashboard-grid">
            <MemoryInsights />
            <AutomationsSummary />
          </div>
        </div>
      </div>
    </div>
  )
}
