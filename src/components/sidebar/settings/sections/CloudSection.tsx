import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type {
  CloudAccountUser,
  CloudSubscription,
  CloudSubscriptionPlan,
  WorkspaceState,
} from '@/features/workspace/types'

type Props = {
  state: WorkspaceState
  onConnect: (options?: { name?: string; baseUrl?: string }) => Promise<void> | void
  onRefresh: () => Promise<void> | void
  onUpdateUser: (userId: string, updates: { subscriptionPlan?: CloudSubscriptionPlan; isAdmin?: boolean }) => Promise<void> | void
  onGrantSubscription: (userId: string, grant: { planId: CloudSubscriptionPlan; durationDays?: number | null }) => Promise<void> | void
  onUpdatePlan: (planId: CloudSubscriptionPlan, updates: { label?: string; parallelSessionsLimit?: number; isDefault?: boolean }) => Promise<void> | void
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString()
}

function PlanRow({
  plan,
  onUpdatePlan,
}: {
  plan: CloudSubscription
  onUpdatePlan: Props['onUpdatePlan']
}) {
  const [label, setLabel] = useState(plan.label)
  const [parallelSessionsLimit, setParallelSessionsLimit] = useState(String(plan.parallelSessionsLimit))
  const [isDefault, setIsDefault] = useState(Boolean(plan.isDefault))

  return (
    <div className="settings-list-row" style={{ alignItems: 'flex-start', gap: '16px' }}>
      <div className="settings-mono" style={{ minWidth: '80px', paddingTop: '10px' }}>{plan.id}</div>
      <label className="settings-row-wrap" style={{ minWidth: '180px' }}>
        <span className="settings-label">Label</span>
        <input
          className="settings-input"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
        />
      </label>
      <label className="settings-row-wrap" style={{ minWidth: '180px' }}>
        <span className="settings-label">Sessions parallèles</span>
        <input
          className="settings-input"
          type="number"
          min={0}
          value={parallelSessionsLimit}
          onChange={(event) => setParallelSessionsLimit(event.target.value)}
        />
      </label>
      <label className="settings-toggle-row" style={{ minWidth: '140px' }}>
        <span className="settings-label">Plan par défaut</span>
        <input
          type="checkbox"
          checked={isDefault}
          onChange={(event) => setIsDefault(event.target.checked)}
        />
      </label>
      <button
        type="button"
        className="settings-action"
        onClick={() =>
          void onUpdatePlan(plan.id, {
            label,
            parallelSessionsLimit: Number.parseInt(parallelSessionsLimit, 10) || 0,
            isDefault,
          })
        }
      >
        Sauvegarder
      </button>
    </div>
  )
}

function UserRow({
  user,
  plans,
  onUpdateUser,
  onGrantSubscription,
}: {
  user: CloudAccountUser
  plans: CloudSubscription[]
  onUpdateUser: Props['onUpdateUser']
  onGrantSubscription: Props['onGrantSubscription']
}) {
  const [plan, setPlan] = useState<CloudSubscriptionPlan>(user.subscription.id)
  const [isAdmin, setIsAdmin] = useState<boolean>(user.isAdmin)
  const [grantPlan, setGrantPlan] = useState<CloudSubscriptionPlan>(user.subscription.id)
  const [grantMode, setGrantMode] = useState<'unlimited' | 'days'>(
    user.complimentaryGrant?.expiresAt ? 'days' : 'unlimited',
  )
  const [grantDays, setGrantDays] = useState('30')

  return (
    <div className="settings-list-row" style={{ alignItems: 'flex-start', gap: '16px' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="settings-card-title" style={{ fontSize: '14px' }}>{user.displayName}</div>
        <div className="settings-card-note">{user.email}</div>
        <div className="settings-card-note">Créé le {formatDate(user.createdAt)}</div>
        {user.complimentaryGrant ? (
          <div className="settings-card-note">
            Allocation admin active: {user.complimentaryGrant.plan.label}
            {user.complimentaryGrant.expiresAt ? ` jusqu'au ${formatDate(user.complimentaryGrant.expiresAt)}` : ' sans expiration'}
          </div>
        ) : null}
      </div>
      <label className="settings-row-wrap" style={{ minWidth: '160px' }}>
        <span className="settings-label">Plan</span>
        <select
          className="settings-input"
          value={plan}
          onChange={(event) => setPlan(event.target.value as CloudSubscriptionPlan)}
        >
          {plans.map((option) => (
            <option key={option.id} value={option.id}>
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
      <div className="settings-row-wrap" style={{ minWidth: '320px' }}>
        <span className="settings-label">Allocation manuelle</span>
        <div style={{ display: 'grid', gap: '8px' }}>
          <select
            className="settings-input"
            value={grantPlan}
            onChange={(event) => setGrantPlan(event.target.value as CloudSubscriptionPlan)}
          >
            {plans.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <select
              className="settings-input"
              value={grantMode}
              onChange={(event) => setGrantMode(event.target.value as 'unlimited' | 'days')}
            >
              <option value="unlimited">Illimitée</option>
              <option value="days">Durée en jours</option>
            </select>
            {grantMode === 'days' ? (
              <input
                className="settings-input"
                type="number"
                min={1}
                value={grantDays}
                onChange={(event) => setGrantDays(event.target.value)}
                placeholder="30"
              />
            ) : null}
          </div>
          <button
            type="button"
            className="settings-action-secondary"
            onClick={() =>
              void onGrantSubscription(user.id, {
                planId: grantPlan,
                durationDays: grantMode === 'days' ? Math.max(1, Number.parseInt(grantDays, 10) || 0) : null,
              })
            }
          >
            Allouer sans paiement
          </button>
        </div>
      </div>
    </div>
  )
}

export function CloudSection({ state, onConnect, onRefresh, onUpdateUser, onGrantSubscription, onUpdatePlan }: Props) {
  const { t } = useTranslation()
  const account = state.cloudAccount
  const cloudInstances = state.cloudInstances
  const plans = account?.plans ?? []
  const visibleCloudInstances = cloudInstances.length > 0
  const activeOrganization =
    account?.organizations.find((organization) => organization.id === account.activeOrganizationId) ??
    account?.organizations[0] ??
    null

  const cloudStatusText = useMemo(() => {
    if (cloudInstances.length === 0) {
      return 'Aucune instance connectée'
    }
    return cloudInstances
      .map((instance) => {
        const hasSession = Boolean(instance.userEmail)
        const statusLabel =
          instance.connectionStatus === 'connecting' && hasSession
            ? 'session connectée, realtime en connexion'
            : instance.connectionStatus === 'connected'
              ? 'connecté'
              : instance.connectionStatus === 'connecting'
                ? 'connexion en cours'
                : instance.connectionStatus === 'disconnected'
                  ? 'realtime déconnecté'
                  : 'erreur'
        return `${instance.name}: ${statusLabel}`
      })
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
              <div className="settings-row-wrap">
                <span className="settings-label">Organisation active</span>
                <div className="settings-card-note">
                  {activeOrganization ? `${activeOrganization.name} · ${activeOrganization.role}` : 'Aucune'}
                </div>
              </div>
            </div>
            {visibleCloudInstances ? (
              <div className="settings-cloud-instance-list">
                {cloudInstances.map((instance) => (
                  <div key={instance.id} className={`settings-cloud-instance-card settings-cloud-instance-${instance.connectionStatus}`}>
                    <div>
                      <div className="settings-card-title" style={{ fontSize: '14px' }}>{instance.name}</div>
                      <div className="settings-card-note">{instance.baseUrl}</div>
                    </div>
                    <div className="settings-card-note">
                      {instance.connectionStatus === 'connecting' && instance.userEmail
                        ? 'session connectée, realtime en connexion'
                        : instance.connectionStatus === 'connected'
                          ? 'connecté'
                          : instance.connectionStatus === 'connecting'
                            ? 'connexion en cours'
                            : instance.connectionStatus === 'disconnected'
                              ? 'realtime déconnecté'
                              : 'erreur'}
                      {instance.lastError ? ` · ${instance.lastError}` : ''}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
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
            Les contrôles d’administration restent disponibles ici, mais le statut cloud quotidien reste visible dans la carte ci-dessus.
          </div>
          <div className="settings-cloud-admin-grid">
            <div className="settings-subcard" style={{ display: 'grid', gap: '12px' }}>
              <div className="settings-card-title" style={{ fontSize: '14px' }}>Plans d’abonnement</div>
              {plans.map((plan) => (
                <PlanRow key={plan.id} plan={plan} onUpdatePlan={onUpdatePlan} />
              ))}
            </div>

            <div className="settings-subcard" style={{ display: 'grid', gap: '12px' }}>
              <div className="settings-card-title" style={{ fontSize: '14px' }}>Utilisateurs</div>
              {state.cloudAdminUsers.map((user) => (
                <UserRow key={user.id} user={user} plans={plans} onUpdateUser={onUpdateUser} onGrantSubscription={onGrantSubscription} />
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  )
}
