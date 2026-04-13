import crypto from 'node:crypto'

export const port = Number.parseInt(process.env.PORT ?? '4000', 10)
export const version = process.env.CHATONS_CLOUD_VERSION ?? '0.1.0'
export const publicBaseUrl = process.env.CHATONS_CLOUD_PUBLIC_URL ?? `http://127.0.0.1:${port}`
export const desktopAuthRequestTtlSeconds = Number.parseInt(
  process.env.CHATONS_DESKTOP_AUTH_REQUEST_TTL_SECONDS ?? '300',
  10,
)
export const maxJsonBodyBytes = Number.parseInt(
  process.env.CHATONS_CLOUD_MAX_JSON_BODY_BYTES ?? '1048576',
  10,
)
export const internalServiceToken = process.env.CHATONS_INTERNAL_SERVICE_TOKEN?.trim() ?? ''
export const oidcIssuer = process.env.OIDC_ISSUER_URL?.trim() || publicBaseUrl
export const oidcClientId = process.env.OIDC_CLIENT_ID?.trim() || 'chatons-desktop'
export const oidcClientSecret = process.env.OIDC_CLIENT_SECRET?.trim() || ''
export const jwtSigningKey = process.env.JWT_SIGNING_KEY?.trim() || 'replace-with-32-plus-char-random-signing-key'
export const accessTokenLifetimeSeconds = Number.parseInt(
  process.env.CHATONS_CLOUD_ACCESS_TOKEN_TTL_SECONDS ?? `${30 * 24 * 60 * 60}`,
  10,
)
export const idTokenLifetimeSeconds = Number.parseInt(
  process.env.CHATONS_CLOUD_ID_TOKEN_TTL_SECONDS ?? '3600',
  10,
)
export const webBaseUrl = process.env.CHATONS_CLOUD_WEB_URL?.trim() || publicBaseUrl
export const realtimePublicBaseUrl =
  process.env.CHATONS_REALTIME_PUBLIC_URL?.trim() || publicBaseUrl.replace(/^http/i, 'ws')
export const runtimePublicBaseUrl =
  process.env.CHATONS_RUNTIME_PUBLIC_URL?.trim() || publicBaseUrl
export const emailVerificationTtlSeconds = Number.parseInt(
  process.env.CHATONS_CLOUD_EMAIL_VERIFICATION_TTL_SECONDS ?? `${24 * 60 * 60}`,
  10,
)
export const passwordResetTtlSeconds = Number.parseInt(
  process.env.CHATONS_CLOUD_PASSWORD_RESET_TTL_SECONDS ?? '3600',
  10,
)

export const jwkKid = crypto
  .createHash('sha256')
  .update(jwtSigningKey)
  .digest('base64url')
  .slice(0, 16)
