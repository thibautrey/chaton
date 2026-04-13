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
  onLogin: () => Promise<void> | void
  onSignup: () => Promise<void> | void
  onRefresh: () => Promise<void> | void
  onLogout: () => Promise<void> | void
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

const cardClassName = 'rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950'
const subcardClassName = 'rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60'
const cardTitleClassName = 'text-base font-semibold text-zinc-900 dark:text-zinc-100'
const smallTitleClassName = 'text-sm font-semibold text-zinc-900 dark:text-zinc-100'
const noteClassName = 'text-sm text-zinc-600 dark:text-zinc-400'
const labelClassName = 'text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400'
const inputClassName = 'w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-zinc-500 dark:focus:ring-zinc-800'
const primaryButtonClassName = 'inline-flex items-center justify-center rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200'
const secondaryButtonClassName = 'inline-flex items-center justify-center rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800'

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
    <div className="flex flex-wrap items-start gap-4 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950/60">
      <div className="min-w-[80px] pt-2.5 font-mono text-xs text-zinc-600 dark:text-zinc-400">{plan.id}</div>
      <label className="grid min-w-[180px] gap-1.5">
        <span className={labelClassName}>Label</span>
        <input
          className={inputClassName}
          value={label}
          onChange={(event) => setLabel(event.target.value)}
        />
      </label>
      <label className="grid min-w-[180px] gap-1.5">
        <span className={labelClassName}>Sessions parallèles</span>
        <input
          className={inputClassName}
          type="number"
          min={0}
          value={parallelSessionsLimit}
          onChange={(event) => setParallelSessionsLimit(event.target.value)}
        />
      </label>
      <label className="flex min-w-[140px] items-center gap-3 pt-6">
        <span className={labelClassName}>Plan par défaut</span>
        <input
          className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-300 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:ring-zinc-700"
          type="checkbox"
          checked={isDefault}
          onChange={(event) => setIsDefault(event.target.checked)}
        />
      </label>
      <button
        type="button"
        className={primaryButtonClassName}
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
    <div className="flex flex-wrap items-start gap-4 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950/60">
      <div className="min-w-0 flex-1">
        <div className={smallTitleClassName}>{user.displayName}</div>
        <div className={noteClassName}>{user.email}</div>
        <div className={noteClassName}>Créé le {formatDate(user.createdAt)}</div>
        {user.complimentaryGrant ? (
          <div className={noteClassName}>
            Allocation admin active: {user.complimentaryGrant.plan.label}
            {user.complimentaryGrant.expiresAt ? ` jusqu'au ${formatDate(user.complimentaryGrant.expiresAt)}` : ' sans expiration'}
          </div>
        ) : null}
      </div>
      <label className="grid min-w-[160px] gap-1.5">
        <span className={labelClassName}>Plan</span>
        <select
          className={inputClassName}
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
      <label className="flex min-w-[120px] items-center gap-3 pt-6">
        <span className={labelClassName}>Admin</span>
        <input
          className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-300 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:ring-zinc-700"
          type="checkbox"
          checked={isAdmin}
          onChange={(event) => setIsAdmin(event.target.checked)}
        />
      </label>
      <button
        type="button"
        className={primaryButtonClassName}
        onClick={() => void onUpdateUser(user.id, { subscriptionPlan: plan, isAdmin })}
      >
        Sauvegarder
      </button>
      <div className="grid min-w-[320px] gap-1.5">
        <span className={labelClassName}>Allocation manuelle</span>
        <div className="grid gap-2">
          <select
            className={inputClassName}
            value={grantPlan}
            onChange={(event) => setGrantPlan(event.target.value as CloudSubscriptionPlan)}
          >
            {plans.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <select
              className={inputClassName}
              value={grantMode}
              onChange={(event) => setGrantMode(event.target.value as 'unlimited' | 'days')}
            >
              <option value="unlimited">Illimitée</option>
              <option value="days">Durée en jours</option>
            </select>
            {grantMode === 'days' ? (
              <input
                className={inputClassName}
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
            className={secondaryButtonClassName}
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

export function CloudSection({ state, onLogin, onSignup, onRefresh, onLogout, onUpdateUser, onGrantSubscription, onUpdatePlan }: Props) {
  const { t } = useTranslation()
  const account = state.cloudAccount
  const cloudInstances = state.cloudInstances
  const plans = account?.plans ?? []

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

  const hasAccount = Boolean(account)
  const hasInstances = cloudInstances.length > 0
  const isAuthenticating = cloudInstances.some((instance) => instance.connectionStatus === 'connecting' && !instance.userEmail)
  const hasSessionIssue = hasInstances && !hasAccount && !isAuthenticating

  // Guard clause for account block - TypeScript narrowing doesn't work inside JSX conditional
  if (!account) {
    return (
      <div className="grid gap-4">
        <section className={cardClassName}>
          <h3 className={cardTitleClassName}>{t('Compte cloud')}</h3>
          <div className={`${noteClassName} mb-3`}>
            {cloudStatusText}
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" className={primaryButtonClassName} onClick={() => void onLogin()}>
              {hasSessionIssue ? 'Reconnecter' : 'Se connecter'}
            </button>
            <button type="button" className={secondaryButtonClassName} onClick={() => void onSignup()}>
              S'inscrire
            </button>
          </div>
          {!hasAccount && hasInstances && isAuthenticating && (
            <div className={noteClassName}>
              Connexion cloud en cours... Veuillez terminer l'authentification dans votre navigateur.
            </div>
          )}
          {hasSessionIssue && (
            <div className={noteClassName}>
              La session cloud est absente, expirée ou invalide. Reconnectez-vous pour continuer.
            </div>
          )}
        </section>
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      <section className={cardClassName}>
        <h3 className={cardTitleClassName}>{t('Compte cloud')}</h3>
        <div className={`${noteClassName} mb-3`}>
          {cloudStatusText}
        </div>
        {!hasInstances && (
          <div className="flex flex-wrap gap-3">
            <button type="button" className={primaryButtonClassName} onClick={() => void onLogin()}>
              Se connecter
            </button>
            <button type="button" className={secondaryButtonClassName} onClick={() => void onSignup()}>
              S'inscrire
            </button>
          </div>
        )}
        {hasAccount && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <div className="grid gap-1.5">
                <span className={labelClassName}>Nom</span>
                <div className={noteClassName}>{account.user.displayName}</div>
              </div>
              <div className="grid gap-1.5">
                <span className={labelClassName}>Email</span>
                <div className={noteClassName}>{account.user.email}</div>
              </div>
              <div className="grid gap-1.5">
                <span className={labelClassName}>Abonnement</span>
                <div className={noteClassName}>
                  {account.user.subscription.label} · {account.user.subscription.parallelSessionsLimit} sessions parallèles
                </div>
              </div>
              <div className="grid gap-1.5">
                <span className={labelClassName}>Usage actuel</span>
                <div className={noteClassName}>
                  {account.usage.activeParallelSessions} actives, {account.usage.remainingParallelSessions} restantes
                </div>
              </div>
              <div className="grid gap-1.5">
                <span className={labelClassName}>Rôle</span>
                <div className={noteClassName}>{account.user.isAdmin ? 'Admin' : 'Utilisateur'}</div>
              </div>
              <div className="grid gap-1.5">
                <span className={labelClassName}>Organisations</span>
                <div className={noteClassName}>
                  {account.organizations.length === 0 ? (
                    'Aucune'
                  ) : (
                    <div className="flex flex-col gap-1">
                      {account.organizations.map((org) => (
                        <div key={org.id} className="flex items-center gap-2">
                          {org.id === account.activeOrganizationId && (
                            <span className="font-medium text-blue-600 dark:text-blue-400">●</span>
                          )}
                          <span>{org.name}</span>
                          <span className="text-zinc-400 dark:text-zinc-500">·</span>
                          <span className="capitalize">{org.role.replace('_', ' ')}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            {hasInstances ? (
              <div className="mt-4 grid gap-3">
                {cloudInstances.map((instance) => (
                  <div
                    key={instance.id}
                    className={`rounded-lg border p-3 ${
                      instance.connectionStatus === 'connected'
                        ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/30'
                        : instance.connectionStatus === 'connecting'
                          ? 'border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30'
                          : instance.connectionStatus === 'disconnected'
                            ? 'border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/60'
                            : 'border-rose-200 bg-rose-50 dark:border-rose-900/60 dark:bg-rose-950/30'
                    }`}
                  >
                    <div>
                      <div className={smallTitleClassName}>{instance.name}</div>
                      <div className={noteClassName}>{instance.baseUrl}</div>
                    </div>
                    <div className={`${noteClassName} mt-2`}>
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
            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" className={secondaryButtonClassName} onClick={() => void onRefresh()}>
                Rafraîchir
              </button>
              <button type="button" className={secondaryButtonClassName} onClick={() => void onLogout()}>
                Se déconnecter
              </button>
            </div>
          </>
        )}
      </section>

      {account.user.isAdmin ? (
        <section className={cardClassName}>
          <h3 className={cardTitleClassName}>Administration cloud</h3>
          <div className={`${noteClassName} mb-3`}>
            Les contrôles d’administration restent disponibles ici, mais le statut cloud quotidien reste visible dans la carte ci-dessus.
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <div className={`${subcardClassName} grid gap-3`}>
              <div className={smallTitleClassName}>Plans d’abonnement</div>
              {plans.map((plan) => (
                <PlanRow key={plan.id} plan={plan} onUpdatePlan={onUpdatePlan} />
              ))}
            </div>

            <div className={`${subcardClassName} grid gap-3`}>
              <div className={smallTitleClassName}>Utilisateurs</div>
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
