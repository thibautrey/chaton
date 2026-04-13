export type CloudProviderKind = "openai" | "anthropic" | "google" | "github-copilot"
export type CloudPlan = "plus" | "pro" | "max"

export type CloudOrganization = {
  id: string
  name: string
  slug: string
  role: "owner" | "admin" | "member" | "billing_viewer"
  providers: Array<{
    id: string
    kind: CloudProviderKind
    label: string
    secretHint: string
    createdAt: string
  }>
}

export type CloudAccount = {
  id: string
  email: string
  fullName: string
  organizations: CloudOrganization[]
  activeOrganizationId: string | null
  desktopConnectedAt: string | null
  accessToken?: string
  refreshToken?: string
  expiresAt?: string
  plan?: CloudPlan
  baseUrl?: string
  requiresEmailVerification?: boolean
}

const STORAGE_KEY = "chatons-cloud-web-session"
const DEFAULT_BASE_URL =
  (import.meta.env.VITE_CHATONS_CLOUD_API_URL as string | undefined)?.trim() || "https://cloud.chatons.ai"

function readStorage(): CloudAccount | null {
  if (typeof window === "undefined") {
    return null
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as CloudAccount) : null
  } catch {
    return null
  }
}

function writeStorage(account: CloudAccount): void {
  if (typeof window === "undefined") {
    return
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(account))
}

function buildAccountFromBootstrap(input: {
  user: {
    id: string
    email: string
    displayName: string
    subscription: { id: CloudPlan }
  }
  organizations: Array<{
    id: string
    name: string
    slug: string
    role: "owner" | "admin" | "member" | "billing_viewer"
    providers?: CloudOrganization["providers"]
  }>
  activeOrganizationId?: string | null
  session?: {
    accessToken: string
    refreshToken: string
    expiresAt: string
  }
  baseUrl?: string
  desktopConnectedAt?: string | null
}): CloudAccount {
  return {
    id: input.user.id,
    email: input.user.email,
    fullName: input.user.displayName,
    organizations: input.organizations.map((organization) => ({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      role: organization.role,
      providers: organization.providers ?? [],
    })),
    activeOrganizationId: input.activeOrganizationId ?? input.organizations[0]?.id ?? null,
    desktopConnectedAt: input.desktopConnectedAt ?? null,
    accessToken: input.session?.accessToken,
    refreshToken: input.session?.refreshToken,
    expiresAt: input.session?.expiresAt,
    plan: input.user.subscription.id,
    baseUrl: input.baseUrl ?? DEFAULT_BASE_URL,
    requiresEmailVerification: false,
  }
}

async function refreshStoredSession(existing: CloudAccount): Promise<CloudAccount | null> {
  if (!existing.refreshToken) {
    clearCloudAccount()
    return null
  }

  const response = await fetch(`${DEFAULT_BASE_URL}/oidc/token`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      grantType: 'refresh_token',
      clientId: 'chatons-desktop',
      redirectUri: 'chatons://cloud/auth/callback',
      refreshToken: existing.refreshToken,
    }),
  })

  if (!response.ok) {
    clearCloudAccount()
    return null
  }

  const exchanged = (await response.json()) as {
    session: { accessToken: string; refreshToken: string; expiresAt: string }
  }
  const next: CloudAccount = {
    ...existing,
    accessToken: exchanged.session.accessToken,
    refreshToken: exchanged.session.refreshToken,
    expiresAt: exchanged.session.expiresAt,
  }
  writeStorage(next)
  return next
}

async function request<TResponse>(path: string, init?: RequestInit, accessToken?: string): Promise<TResponse> {
  let token = accessToken
  if (token) {
    const existing = readStorage()
    if (existing?.accessToken === token && existing.expiresAt) {
      const expiresAt = Date.parse(existing.expiresAt)
      if (Number.isFinite(expiresAt) && expiresAt - Date.now() <= 60_000) {
        const refreshed = await refreshStoredSession(existing)
        token = refreshed?.accessToken
      }
    }
  }

  const response = await fetch(`${DEFAULT_BASE_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  })
  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `Request failed with status ${response.status}`)
  }
  return (await response.json()) as TResponse
}

export function getCloudAccount(): CloudAccount | null {
  return readStorage()
}

export function clearCloudAccount(): void {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(STORAGE_KEY)
  }
}

export async function signupCloudAccount(input: {
  email: string
  fullName: string
  password: string
}): Promise<CloudAccount> {
  const session = await request<{
    user: { id: string; email: string; displayName: string; subscription: { id: CloudPlan } }
    session: { accessToken: string; refreshToken: string; expiresAt: string }
    requiresEmailVerification?: boolean
  }>("/v1/web/signup", {
    method: "POST",
    body: JSON.stringify({
      email: input.email.trim(),
      displayName: input.fullName.trim(),
      password: input.password,
    }),
  })
  const bootstrap = await request<{
    user: { id: string; email: string; displayName: string; subscription: { id: CloudPlan } }
    organizations: Array<{
      id: string
      name: string
      slug: string
      role: "owner" | "admin" | "member" | "billing_viewer"
      providers?: CloudOrganization["providers"]
    }>
    activeOrganizationId: string | null
  }>("/v1/bootstrap", undefined, session.session.accessToken)
  const account = buildAccountFromBootstrap({
    user: bootstrap.user,
    organizations: bootstrap.organizations,
    activeOrganizationId: bootstrap.activeOrganizationId,
    session: session.session,
    baseUrl: DEFAULT_BASE_URL,
  })
  account.requiresEmailVerification = session.requiresEmailVerification === true
  writeStorage(account)
  return account
}

export async function loginCloudAccount(input: {
  email: string
  password: string
}): Promise<CloudAccount> {
  const session = await request<{
    user: { id: string; email: string; displayName: string; subscription: { id: CloudPlan } }
    session: { accessToken: string; refreshToken: string; expiresAt: string }
  }>("/v1/web/login", {
    method: "POST",
    body: JSON.stringify({
      email: input.email.trim(),
      password: input.password,
    }),
  })
  const bootstrap = await request<{
    user: { id: string; email: string; displayName: string; subscription: { id: CloudPlan } }
    organizations: Array<{
      id: string
      name: string
      slug: string
      role: "owner" | "admin" | "member" | "billing_viewer"
      providers?: CloudOrganization["providers"]
    }>
    activeOrganizationId: string | null
  }>("/v1/bootstrap", undefined, session.session.accessToken)
  const account = buildAccountFromBootstrap({
    user: bootstrap.user,
    organizations: bootstrap.organizations,
    activeOrganizationId: bootstrap.activeOrganizationId,
    session: session.session,
    baseUrl: DEFAULT_BASE_URL,
  })
  writeStorage(account)
  return account
}

export async function requestPasswordReset(input: {
  email: string
}): Promise<void> {
  await request<{ ok: true }>("/v1/web/forgot-password", {
    method: "POST",
    body: JSON.stringify({
      email: input.email.trim(),
    }),
  })
}

export async function resetCloudPassword(input: {
  token: string
  password: string
}): Promise<void> {
  await request<{ ok: true }>("/v1/web/reset-password", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export async function verifyCloudEmail(input: {
  token: string
}): Promise<void> {
  await request<{ ok: true }>("/v1/web/verify-email", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export async function refreshCloudAccount(): Promise<CloudAccount | null> {
  const existing = readStorage()
  if (!existing?.accessToken) {
    return existing
  }
  const bootstrap = await request<{
    user: { id: string; email: string; displayName: string; subscription: { id: CloudPlan } }
    organizations: Array<{
      id: string
      name: string
      slug: string
      role: "owner" | "admin" | "member" | "billing_viewer"
      providers?: CloudOrganization["providers"]
    }>
    activeOrganizationId: string | null
  }>("/v1/bootstrap", undefined, existing.accessToken)
  const next = buildAccountFromBootstrap({
    user: bootstrap.user,
    organizations: bootstrap.organizations,
    activeOrganizationId: bootstrap.activeOrganizationId,
    session: existing.accessToken && existing.refreshToken && existing.expiresAt
      ? {
          accessToken: existing.accessToken,
          refreshToken: existing.refreshToken,
          expiresAt: existing.expiresAt,
        }
      : undefined,
    baseUrl: existing.baseUrl ?? DEFAULT_BASE_URL,
    desktopConnectedAt: existing.desktopConnectedAt,
  })
  writeStorage(next)
  return next
}

function replaceOrganization(
  organizations: CloudOrganization[],
  organization: CloudOrganization,
): CloudOrganization[] {
  const index = organizations.findIndex((item) => item.id === organization.id)
  if (index < 0) {
    return [...organizations, organization]
  }
  const next = [...organizations]
  next[index] = organization
  return next
}

export async function upsertOrganization(
  account: CloudAccount,
  input: {
    organizationId?: string
    name: string
    slug: string
    plan: CloudPlan
  },
): Promise<CloudAccount> {
  if (!account.accessToken) {
    throw new Error("Missing cloud session")
  }
  const response = await request<{
    organization: {
      id: string
      name: string
      slug: string
      role: "owner" | "admin" | "member" | "billing_viewer"
      providers?: CloudOrganization["providers"]
    }
  }>("/v1/organization", {
    method: "PATCH",
    body: JSON.stringify({
      organizationId: input.organizationId ?? account.activeOrganizationId,
      name: input.name,
      slug: input.slug,
      plan: input.plan,
    }),
  }, account.accessToken)
  const next: CloudAccount = {
    ...account,
    organizations: replaceOrganization(account.organizations, {
      ...response.organization,
      providers: response.organization.providers ?? [],
    }),
    plan: input.plan,
  }
  writeStorage(next)
  return next
}

export async function addProviderToOrganization(
  account: CloudAccount,
  organizationId: string,
  input: {
    kind: CloudProviderKind
    label: string
    secret: string
  },
): Promise<CloudAccount> {
  if (!account.accessToken) {
    throw new Error("Missing cloud session")
  }
  const response = await request<{
    provider: CloudOrganization["providers"][number]
    organization: {
      id: string
      name: string
      slug: string
      role: "owner" | "admin" | "member" | "billing_viewer"
      providers?: CloudOrganization["providers"]
    }
  }>("/v1/organization/providers", {
    method: "POST",
    body: JSON.stringify({
      ...input,
      organizationId,
    }),
  }, account.accessToken)
  const next: CloudAccount = {
    ...account,
    organizations: replaceOrganization(account.organizations, {
      ...response.organization,
      providers: response.organization.providers ?? [],
    }),
  }
  writeStorage(next)
  return next
}

export async function setActiveOrganization(
  account: CloudAccount,
  organizationId: string,
): Promise<CloudAccount> {
  if (!account.accessToken) {
    throw new Error("Missing cloud session")
  }
  await request<{ ok: true; activeOrganizationId: string }>("/v1/organization/active", {
    method: "POST",
    body: JSON.stringify({ organizationId }),
  }, account.accessToken)
  const next = await refreshCloudAccount()
  if (!next) {
    throw new Error("Unable to refresh cloud account")
  }
  return next
}

export async function createOrganizationInvite(
  account: CloudAccount,
  organizationId: string,
  email: string,
): Promise<void> {
  if (!account.accessToken) {
    throw new Error("Missing cloud session")
  }
  await request<{ ok: true }>("/v1/organization/invites", {
    method: "POST",
    body: JSON.stringify({ organizationId, email: email.trim() }),
  }, account.accessToken)
}

export async function acceptOrganizationInvite(
  account: CloudAccount,
  token: string,
): Promise<CloudAccount> {
  if (!account.accessToken) {
    throw new Error("Missing cloud session")
  }
  await request<{ ok: true }>("/v1/organization/invites/accept", {
    method: "POST",
    body: JSON.stringify({ token }),
  }, account.accessToken)
  const next = await refreshCloudAccount()
  if (!next) {
    throw new Error("Unable to refresh cloud account")
  }
  return next
}

