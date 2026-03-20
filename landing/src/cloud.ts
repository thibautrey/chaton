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
  desktopConnectedAt: string | null
  accessToken?: string
  refreshToken?: string
  expiresAt?: string
  plan?: CloudPlan
  baseUrl?: string
}

const STORAGE_KEY = "chatons-cloud-web-session"
const DEFAULT_BASE_URL =
  (import.meta.env.VITE_CHATONS_CLOUD_API_URL as string | undefined)?.trim() || "http://127.0.0.1:4000"

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
    desktopConnectedAt: input.desktopConnectedAt ?? null,
    accessToken: input.session?.accessToken,
    refreshToken: input.session?.refreshToken,
    expiresAt: input.session?.expiresAt,
    plan: input.user.subscription.id,
    baseUrl: input.baseUrl ?? DEFAULT_BASE_URL,
  }
}

async function request<TResponse>(path: string, init?: RequestInit, accessToken?: string): Promise<TResponse> {
  const response = await fetch(`${DEFAULT_BASE_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
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
}): Promise<CloudAccount> {
  const session = await request<{
    user: { id: string; email: string; displayName: string; subscription: { id: CloudPlan } }
    session: { accessToken: string; refreshToken: string; expiresAt: string }
  }>("/v1/web/signup", {
    method: "POST",
    body: JSON.stringify({
      email: input.email.trim(),
      displayName: input.fullName.trim(),
    }),
  })
  const bootstrap = await request<{
    organizations: Array<{
      id: string
      name: string
      slug: string
      role: "owner" | "admin" | "member" | "billing_viewer"
      providers?: CloudOrganization["providers"]
    }>
  }>("/v1/bootstrap", undefined, session.session.accessToken)
  const account = buildAccountFromBootstrap({
    user: session.user,
    organizations: bootstrap.organizations,
    session: session.session,
    baseUrl: DEFAULT_BASE_URL,
  })
  writeStorage(account)
  return account
}

export async function loginCloudAccount(input: {
  email: string
}): Promise<CloudAccount> {
  const session = await request<{
    user: { id: string; email: string; displayName: string; subscription: { id: CloudPlan } }
    session: { accessToken: string; refreshToken: string; expiresAt: string }
  }>("/v1/web/login", {
    method: "POST",
    body: JSON.stringify({
      email: input.email.trim(),
    }),
  })
  const bootstrap = await request<{
    organizations: Array<{
      id: string
      name: string
      slug: string
      role: "owner" | "admin" | "member" | "billing_viewer"
      providers?: CloudOrganization["providers"]
    }>
  }>("/v1/bootstrap", undefined, session.session.accessToken)
  const account = buildAccountFromBootstrap({
    user: session.user,
    organizations: bootstrap.organizations,
    session: session.session,
    baseUrl: DEFAULT_BASE_URL,
  })
  writeStorage(account)
  return account
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
  }>("/v1/bootstrap", undefined, existing.accessToken)
  const next = buildAccountFromBootstrap({
    user: bootstrap.user,
    organizations: bootstrap.organizations,
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

export async function upsertOrganization(
  account: CloudAccount,
  input: {
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
    body: JSON.stringify(input),
  }, account.accessToken)
  const next: CloudAccount = {
    ...account,
    organizations: [response.organization],
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
    organizations: [response.organization],
  }
  writeStorage(next)
  return next
}

export function markDesktopConnected(account: CloudAccount): CloudAccount {
  const next = {
    ...account,
    desktopConnectedAt: new Date().toISOString(),
  }
  writeStorage(next)
  return next
}
