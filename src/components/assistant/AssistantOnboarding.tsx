import { useCallback, useEffect, useState } from 'react'
import { Bot, Check, Download, Loader2, MessageSquareShare, Sparkles, User } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { workspaceIpc } from '@/services/ipc/workspace'
import { useWorkspace } from '@/features/workspace/store'
import type { ChatonsExtension, ChatonsExtensionCatalogItem } from '@/features/workspace/types'
import heroCat from '@/assets/chaton-hero.webm'

type Step = 0 | 1 | 2 | 3

function isChannelExtension(ext: ChatonsExtension): boolean {
  return ext.config?.kind === 'channel'
}

export function AssistantOnboarding() {
  const { t } = useTranslation()
  const { state, updateSettings } = useWorkspace()
  const [step, setStep] = useState<Step>(0)

  // Step 1 state: channel selection
  const [installedChannels, setInstalledChannels] = useState<ChatonsExtension[]>([])
  const [marketplaceItems, setMarketplaceItems] = useState<ChatonsExtensionCatalogItem[]>([])
  const [loadingMarketplace, setLoadingMarketplace] = useState(false)
  const [installingId, setInstallingId] = useState<string | null>(null)
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null)
  const [channelDisplayNames, setChannelDisplayNames] = useState<Map<string, string>>(new Map())

  // Step 2 state: personalization
  const [assistantName, setAssistantName] = useState(state.settings.assistantName || 'Chaton')
  const [userName, setUserName] = useState(state.settings.assistantUserName || '')

  // Track IDs installed during this session so they show as installed
  // even before the extension server starts and exposes config.kind
  const [justInstalledIds, setJustInstalledIds] = useState<Set<string>>(new Set())

  const loadChannelData = useCallback(async () => {
    setLoadingMarketplace(true)
    try {
      const [installed, marketplace] = await Promise.all([
        workspaceIpc.listExtensions(),
        workspaceIpc.getExtensionMarketplace(),
      ])
      const allInstalled = installed.extensions ?? []
      const installedIds = new Set(allInstalled.map((ext) => ext.id))

      // Collect all marketplace items and identify which ones are channels
      const allItems: ChatonsExtensionCatalogItem[] = []
      const seen = new Set<string>()
      const addItems = (items?: ChatonsExtensionCatalogItem[]) => {
        for (const item of items ?? []) {
          if (!seen.has(item.id)) {
            seen.add(item.id)
            allItems.push(item)
          }
        }
      }
      addItems(marketplace.featured)
      addItems(marketplace.new)
      addItems(marketplace.trending)
      for (const cat of marketplace.byCategory ?? []) {
        addItems(cat.items)
      }

      // Build a set of IDs that the marketplace considers as channels
      // and a map of id -> display name from marketplace metadata
      const marketplaceChannelIds = new Set<string>()
      const displayNames = new Map<string, string>()
      for (const item of allItems) {
        displayNames.set(item.id, item.name)
        const lowerCat = (item.category ?? '').toLowerCase()
        const lowerTags = (item.tags ?? []).map((tag) => tag.toLowerCase())
        if (
          lowerCat === 'channel' ||
          lowerCat === 'channels' ||
          lowerCat === 'messaging' ||
          lowerTags.includes('channel') ||
          lowerTags.includes('messaging')
        ) {
          marketplaceChannelIds.add(item.id)
        }
      }

      // An installed extension is a channel if:
      // - its config says so, OR
      // - the marketplace tags it as a channel, OR
      // - it was installed during this onboarding session
      const channels = allInstalled.filter(
        (ext) =>
          ext.enabled &&
          (isChannelExtension(ext) || marketplaceChannelIds.has(ext.id) || justInstalledIds.has(ext.id)),
      )
      setInstalledChannels(channels)

      // Marketplace list: only channels that are NOT already installed
      const channelItems = allItems.filter(
        (item) => marketplaceChannelIds.has(item.id) && !installedIds.has(item.id) && !justInstalledIds.has(item.id),
      )
      setMarketplaceItems(channelItems)
      setChannelDisplayNames(displayNames)

      if (channels.length > 0 && !selectedChannelId) {
        setSelectedChannelId(channels[0].id)
      }
    } finally {
      setLoadingMarketplace(false)
    }
  }, [selectedChannelId, justInstalledIds])

  useEffect(() => {
    void loadChannelData()
  }, [loadChannelData])

  const handleInstallChannel = async (id: string) => {
    setInstallingId(id)
    try {
      const result = await workspaceIpc.installExtension(id)
      if (result.ok) {
        // Mark as installed locally before reloading data
        setJustInstalledIds((prev) => new Set(prev).add(id))
        setSelectedChannelId(id)
      }
    } finally {
      setInstallingId(null)
    }
  }

  const handleFinish = async () => {
    await updateSettings({
      ...state.settings,
      assistantOnboardingCompleted: true,
      assistantName: assistantName.trim() || 'Chaton',
      assistantUserName: userName.trim(),
      assistantChannelId: selectedChannelId ?? '',
    })
  }

  // Step 0: Welcome — replaces the old placeholder screen
  if (step === 0) {
    return (
      <div className="assistant-main">
        <div className="assistant-placeholder">
          <div className="assistant-onboarding-hero">
            <video autoPlay loop muted playsInline className="assistant-onboarding-hero-video">
              <source src={heroCat} type="video/webm" />
            </video>
          </div>
          <h1 className="assistant-placeholder-title">
            {t('assistant.onboarding.welcomeTitle')}
          </h1>
          <p className="assistant-placeholder-subtitle">
            {t('assistant.onboarding.welcomeSubtitle')}
          </p>
          <button
            type="button"
            className="assistant-onboarding-cta"
            onClick={() => setStep(1)}
          >
            <Sparkles className="h-4 w-4" />
            {t('assistant.onboarding.getStarted')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="assistant-onboarding-shell assistant-onboarding-shell-steps">
      <div className="assistant-onboarding-card">
        {/* Step indicator */}
        <div className="assistant-onboarding-steps">
          <button
            type="button"
            className={step === 1 ? 'active' : step > 1 ? 'done' : ''}
            onClick={() => setStep(1)}
            disabled={step < 1}
          >
            <MessageSquareShare className="h-3.5 w-3.5" />
            {t('assistant.onboarding.stepChannel')}
          </button>
          <button
            type="button"
            className={step === 2 ? 'active' : step > 2 ? 'done' : ''}
            onClick={() => setStep(2)}
            disabled={step < 2}
          >
            <User className="h-3.5 w-3.5" />
            {t('assistant.onboarding.stepPersonalize')}
          </button>
          <button
            type="button"
            className={step === 3 ? 'active' : ''}
            disabled
          >
            <Check className="h-3.5 w-3.5" />
            {t('assistant.onboarding.stepDone')}
          </button>
        </div>

        {/* Step 1: Channel */}
        {step === 1 ? (
          <>
            <div className="assistant-onboarding-scrollable">
              <section className="assistant-onboarding-section">
                <h2 className="assistant-onboarding-section-title">
                  {t('assistant.onboarding.channelTitle')}
                </h2>
                <p className="assistant-onboarding-section-desc">
                  {t('assistant.onboarding.channelDesc')}
                </p>

                {loadingMarketplace ? (
                  <div className="assistant-onboarding-loading">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>{t('Chargement...')}</span>
                  </div>
                ) : (
                  <>
                    {installedChannels.length > 0 ? (
                      <div className="assistant-onboarding-channel-list">
                        <div className="assistant-onboarding-channel-label">
                          {t('assistant.onboarding.installedChannels')}
                        </div>
                        <div className="assistant-onboarding-channel-grid">
                          {installedChannels.map((ext) => (
                            <button
                              key={ext.id}
                              type="button"
                              className={`assistant-onboarding-channel-tile ${selectedChannelId === ext.id ? 'selected' : ''}`}
                              onClick={() => setSelectedChannelId(ext.id)}
                            >
                              <div className="assistant-onboarding-tile-icon">
                                <MessageSquareShare className="h-5 w-5" />
                              </div>
                              <span className="assistant-onboarding-tile-name">{channelDisplayNames.get(ext.id) || ext.name}</span>
                              {selectedChannelId === ext.id ? (
                                <Check className="assistant-onboarding-tile-check h-3.5 w-3.5" />
                              ) : null}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {marketplaceItems.length > 0 ? (
                      <div className="assistant-onboarding-channel-list">
                        <div className="assistant-onboarding-channel-label">
                          {t('assistant.onboarding.availableChannels')}
                        </div>
                        <div className="assistant-onboarding-channel-grid">
                          {marketplaceItems.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              className="assistant-onboarding-channel-tile"
                              disabled={installingId === item.id}
                              onClick={() => void handleInstallChannel(item.id)}
                            >
                              <div className="assistant-onboarding-tile-icon">
                                <MessageSquareShare className="h-5 w-5" />
                              </div>
                              <span className="assistant-onboarding-tile-name">{item.name}</span>
                              {installingId === item.id ? (
                                <Loader2 className="assistant-onboarding-tile-badge h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Download className="assistant-onboarding-tile-badge h-3.5 w-3.5" />
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {installedChannels.length === 0 && marketplaceItems.length === 0 ? (
                      <div className="assistant-onboarding-empty">
                        <MessageSquareShare className="h-8 w-8 text-[#b0b5c0] dark:text-[#5a6580]" />
                        <p>{t('assistant.onboarding.noChannelsAvailable')}</p>
                      </div>
                    ) : null}
                  </>
                )}
              </section>
            </div>

            <div className="assistant-onboarding-footer">
              <button
                type="button"
                className="assistant-onboarding-secondary"
                onClick={() => setStep(2)}
              >
                {t('assistant.onboarding.skipStep')}
              </button>
              <button
                type="button"
                className="assistant-onboarding-primary"
                onClick={() => setStep(2)}
                disabled={installedChannels.length === 0 && !selectedChannelId}
              >
                {t('onboarding.continue')}
              </button>
            </div>
          </>
        ) : null}

        {/* Step 2: Personalize */}
        {step === 2 ? (
          <>
            <div className="assistant-onboarding-scrollable">
              <section className="assistant-onboarding-section">
                <h2 className="assistant-onboarding-section-title">
                  {t('assistant.onboarding.personalizeTitle')}
                </h2>
                <p className="assistant-onboarding-section-desc">
                  {t('assistant.onboarding.personalizeDesc')}
                </p>

                <div className="assistant-onboarding-fields">
                  <label className="assistant-onboarding-field">
                    <span className="assistant-onboarding-field-label">
                      <Bot className="h-4 w-4" />
                      {t('assistant.onboarding.assistantNameLabel')}
                    </span>
                    <input
                      type="text"
                      value={assistantName}
                      onChange={(e) => setAssistantName(e.target.value)}
                      placeholder="Chaton"
                      className="assistant-onboarding-input"
                    />
                  </label>
                  <label className="assistant-onboarding-field">
                    <span className="assistant-onboarding-field-label">
                      <User className="h-4 w-4" />
                      {t('assistant.onboarding.userNameLabel')}
                    </span>
                    <input
                      type="text"
                      value={userName}
                      onChange={(e) => setUserName(e.target.value)}
                      placeholder={t('assistant.onboarding.userNamePlaceholder')}
                      className="assistant-onboarding-input"
                    />
                  </label>
                </div>
              </section>
            </div>

            <div className="assistant-onboarding-footer">
              <button
                type="button"
                className="assistant-onboarding-secondary"
                onClick={() => setStep(1)}
              >
                {t('assistant.onboarding.back')}
              </button>
              <button
                type="button"
                className="assistant-onboarding-primary"
                onClick={() => setStep(3)}
              >
                {t('onboarding.continue')}
              </button>
            </div>
          </>
        ) : null}

        {/* Step 3: Complete */}
        {step === 3 ? (
          <section className="assistant-onboarding-section assistant-onboarding-complete">
            <div className="assistant-onboarding-complete-icon">
              <Sparkles className="h-10 w-10" />
            </div>
            <h2 className="assistant-onboarding-section-title">
              {t('assistant.onboarding.completeTitle', { name: assistantName.trim() || 'Chaton' })}
            </h2>
            <p className="assistant-onboarding-section-desc">
              {t('assistant.onboarding.completeDesc')}
            </p>
            <button
              type="button"
              className="assistant-onboarding-primary"
              onClick={() => void handleFinish()}
            >
              {t('assistant.onboarding.openAssistant')}
            </button>
          </section>
        ) : null}
      </div>
    </div>
  )
}
