import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { CloudAccountUser, CloudSubscriptionPlan, WorkspaceState } from '@/features/workspace/types'

type Props = {
  state: WorkspaceState
  onConnect: () => Promise<void> | void
  onRefresh: () => Promise<void> | void
  onUpdateUser: (userId: string, updates: { subscriptionPlan?: CloudSubscriptionPlan; isAdmin?: boolean }) => Promise<void> | void
}

const PLAN_OPTIONS: Array<{ value: CloudSubscriptionPlan; label: string }> = [
  { value: 'plus', label: 'Plus' },
  { value: 'pro', label: 'Pro' },
  { value: 'max', label: 'Max' },
]

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString()
}

function UserRow({
  user,
  onUpdateUser,
}: {
  user: CloudAccountUser
  onUpdateUser: Props['onUpdateUser']
}) {
  const [plan, setPlan] = useState<CloudSubscriptionPlan>(user.subscription.plan)
  const [isAdmin, setIsAdmin] = useState<boolean>(user.isAdmin)

  return (
    <div className="settings-list-row" style={{ alignItems: 'flex-start', gap: '16px' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="settings-card-title" style={{ fontSize: '14px' }}>{user.displayName}</div>
        <div className="settings-card-note">{user.email}</div>
        <div className="settings-card-note">
          Créé le {formatDate(user.createdAt)}
        </div>
      </div>
      <label className="settings-row-wrap" style={{ minWidth: '140px' }}>
        <span className="settings-label">Plan</span>
        <select
          className="settings-input"
          value={plan}
          onChange={(event) => setPlan(event.target.value as CloudSubscriptionPlan)}
        >
          {PLAN_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="settings-toggle-row" style={{ minWidth: '120px' }}>
        <span className="settings-label">Admin</span>
        <input
          type="checkbox"
          checked={isAdmin}
          onChange={(event) => setIsAdmin(event.target.checked)}
        />
      </label>
      <button
        type="button"
        className="settings-action"
        onClick={() => void onUpdateUser(user.id, { subscriptionPlan: plan, isAdmin })}
      >
        Sauvegarder
      </button>
    </div>
  )
}

export function CloudSection({ state, onConnect, onRefresh, onUpdateUser }: Props) {
  const { t } = useTranslation()
  const account = state.cloudAccount
  const cloudInstances = state.cloudInstances

  const cloudStatusText = useMemo(() => {
    if (cloudInstances.length === 0) {
      return 'Aucune instance connectée'
    }
    return cloudInstances
      .map((instance) => `${instance.name}: ${instance.connectionStatus}`)
      .join(' · ')
  }, [cloudInstances])

  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      <section className="settings-card">
        <h3 className="settings-card-title">{t('Compte cloud')}</h3>
        <div className="settings-card-note" style={{ marginBottom: '12px' }}>
          {cloudStatusText}
        </div>
        {!account ? (
          <div className="settings-actions-row">
            <button type="button" className="settings-action" onClick={() => void onConnect()}>
              Connecter Chatons Cloud
            </button>
          </div>
        ) : (
          <>
            <div className="settings-grid">
              <div className="settings-row-wrap">
                <span className="settings-label">Nom</span>
                <div className="settings-card-note">{account.user.displayName}</div>
              </div>
              <div className="settings-row-wrap">
                <span className="settings-label">Email</span>
                <div className="settings-card-note">{account.user.email}</div>
              </div>
              <div className="settings-row-wrap">
                <span className="settings-label">Abonnement</span>
                <div className="settings-card-note">
                  {account.user.subscription.label} · {account.user.subscription.parallelSessionsLimit} sessions parallèles
                </div>
              </div>
              <div className="settings-row-wrap">
                <span className="settings-label">Usage actuel</span>
                <div className="settings-card-note">
                  {account.usage.activeParallelSessions} actives, {account.usage.remainingParallelSessions} restantes
                </div>
              </div>
              <div className="settings-row-wrap">
                <span className="settings-label">Rôle</span>
                <div className="settings-card-note">{account.user.isAdmin ? 'Admin' : 'Utilisateur'}</div>
              </div>
            </div>
            <div className="settings-actions-row" style={{ marginTop: '16px' }}>
              <button type="button" className="settings-action-secondary" onClick={() => void onRefresh()}>
                Rafraîchir
              </button>
            </div>
          </>
        )}
      </section>

      {account?.user.isAdmin ? (
        <section className="settings-card">
          <h3 className="settings-card-title">Administration cloud</h3>
          <div className="settings-card-note" style={{ marginBottom: '12px' }}>
            Le premier utilisateur créé devient admin par défaut. La facturation n’est pas encore branchée, mais les niveaux d’abonnement appliquent déjà les quotas de sessions cloud parallèles.
          </div>
          <div className="settings-list">
            {state.cloudAdminUsers.map((user) => (
              <UserRow key={user.id} user={user} onUpdateUser={onUpdateUser} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
