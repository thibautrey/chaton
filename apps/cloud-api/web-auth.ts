import crypto from 'node:crypto'
import type http from 'node:http'
import type {
  CloudForgotPasswordRequest,
  CloudResetPasswordRequest,
  CloudVerifyEmailRequest,
  CloudWebLoginRequest,
  CloudWebSignupRequest,
} from '../../packages/protocol/index.js'
import {
  emailVerificationTtlSeconds,
  passwordResetTtlSeconds,
  accessTokenLifetimeSeconds,
  webBaseUrl,
} from './config.ts'
import { issueCloudWebSessionResponse, store } from './context.ts'
import {
  escapeHtml,
  escapeHtmlComment,
  html,
  json,
  readFormBody,
  readJsonBody,
  sanitizeRedirectTarget,
  setCookie,
} from './http.ts'
import {
  buildPasswordChangedEmail,
  buildPasswordResetEmail,
  buildVerificationEmail,
  sendMail,
} from './mailer.ts'
import { derivePasswordHash, hashSecret, verifyPassword } from './security.ts'

const WEB_SESSION_COOKIE = 'chatons_cloud_session'
const WEB_SESSION_COOKIE_SECURE = webBaseUrl.startsWith('https://')

function getSafeReturnTo(returnTo: string): string {
  return sanitizeRedirectTarget(returnTo, webBaseUrl) ?? new URL('/cloud', webBaseUrl).toString()
}

function renderWebAuthPage(params: {
  mode: 'login' | 'signup'
  returnTo: string
  error?: string
}): string {
  const title = params.mode === 'signup' ? 'Create your Chatons Cloud account' : 'Sign in to Chatons Cloud'
  const subtitle =
    params.mode === 'signup'
      ? 'Create a cloud account to continue the desktop connection flow.'
      : 'Sign in with your existing cloud account to continue the desktop connection flow.'
  const action = params.mode === 'signup' ? '/v1/web/signup' : '/v1/web/login'
  const submitLabel = params.mode === 'signup' ? 'Create account' : 'Continue'
  const alternateHref = params.mode === 'signup' ? '/cloud/login' : '/cloud/signup'
  const alternateLabel = params.mode === 'signup' ? 'Already have an account? Sign in' : 'Need an account? Create one'
  const hiddenReturnTo = params.returnTo
    ? `<input type="hidden" name="return_to" value="${escapeHtml(params.returnTo)}" />`
    : ''
  const errorMarkup = params.error
    ? `<div class="error" role="alert">${escapeHtml(params.error)}</div>`
    : ''
  const nameField =
    params.mode === 'signup'
      ? `<label>
          <span>Full name</span>
          <input name="displayName" type="text" autocomplete="name" required />
        </label>`
      : ''

  const alternateUrl = new URL(alternateHref, webBaseUrl)
  if (params.returnTo) {
    alternateUrl.searchParams.set('return_to', params.returnTo)
  }

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #f5f2ea; color: #1d1b18; margin: 0; }
      main { max-width: 460px; margin: 6rem auto; background: #fffdf8; border: 1px solid #e6dcc8; border-radius: 18px; padding: 2rem; box-shadow: 0 18px 50px rgba(60,45,20,0.08); }
      h1 { margin: 0 0 0.75rem; font-size: 1.7rem; }
      p { line-height: 1.5; color: #5b5448; }
      form { display: grid; gap: 0.85rem; margin-top: 1.5rem; }
      label { display: grid; gap: 0.35rem; font-weight: 600; }
      input { width: 100%; box-sizing: border-box; padding: 0.8rem 0.9rem; border-radius: 12px; border: 1px solid #d8cfbc; font-size: 1rem; }
      button { margin-top: 0.25rem; width: 100%; background: #1f6f5b; color: white; border: 0; border-radius: 999px; padding: 0.85rem 1rem; font-size: 1rem; font-weight: 700; cursor: pointer; }
      a { display: inline-block; margin-top: 1rem; color: #1f6f5b; text-decoration: none; font-weight: 600; }
      .error { margin-top: 1rem; padding: 0.8rem 0.9rem; border-radius: 12px; background: #fff1ee; border: 1px solid #f2b8ac; color: #8a2f1c; }
      .meta { margin-top: 1rem; font-size: 0.9rem; color: #7b7366; }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(subtitle)}</p>
      ${errorMarkup}
      <form method="POST" action="${action}">
        ${hiddenReturnTo}
        ${nameField}
        <label>
          <span>Email</span>
          <input name="email" type="email" autocomplete="email username" required />
        </label>
        <label>
          <span>Password</span>
          <input name="password" type="password" autocomplete="${params.mode === 'signup' ? 'new-password' : 'current-password'}" required />
        </label>
        <button type="submit">${submitLabel}</button>
      </form>
      <a href="${escapeHtml(alternateUrl.toString())}">${escapeHtml(alternateLabel)}</a>
      <div class="meta">Hosted by ${escapeHtmlComment(webBaseUrl)}</div>
    </main>
  </body>
</html>`
}

async function sendVerificationEmail(user: Awaited<ReturnType<typeof store.getUserById>> extends infer T ? T extends null ? never : T : never, token: string): Promise<void> {
  const verifyUrl = new URL('/cloud/verify-email', webBaseUrl)
  verifyUrl.searchParams.set('token', token)
  const message = buildVerificationEmail({
    verifyUrl: verifyUrl.toString(),
    displayName: user.displayName,
  })
  await sendMail({ ...message, to: user.email })
}

function logAsyncMailFailure(kind: string, error: unknown): void {
  console.error(`[cloud-api] ${kind} email delivery failed`, error)
}

async function sendPasswordResetEmail(user: Awaited<ReturnType<typeof store.getUserById>> extends infer T ? T extends null ? never : T : never, token: string): Promise<void> {
  const resetUrl = new URL('/cloud/reset-password', webBaseUrl)
  resetUrl.searchParams.set('token', token)
  const message = buildPasswordResetEmail({
    resetUrl: resetUrl.toString(),
    displayName: user.displayName,
  })
  await sendMail({ ...message, to: user.email })
}

async function sendPasswordChangedEmail(user: Awaited<ReturnType<typeof store.getUserById>> extends infer T ? T extends null ? never : T : never): Promise<void> {
  const message = buildPasswordChangedEmail({
    displayName: user.displayName,
  })
  await sendMail({ ...message, to: user.email })
}

export async function handleWebAuthRoute(
  method: string,
  url: string,
  request: http.IncomingMessage,
  response: http.ServerResponse,
): Promise<boolean> {
  const parsedUrl = new URL(url, webBaseUrl)
  const pathname = parsedUrl.pathname
  const returnTo = parsedUrl.searchParams.get('return_to')?.trim() ?? ''
  const wantsHtml = (request.headers.accept ?? '').includes('text/html')
  const isBrowserForm = (request.headers['content-type'] ?? '').includes('application/x-www-form-urlencoded')

  if (method === 'GET' && pathname === '/cloud/login') {
    html(request, response, 200, renderWebAuthPage({ mode: 'login', returnTo }))
    return true
  }

  if (method === 'GET' && pathname === '/cloud/signup') {
    html(request, response, 200, renderWebAuthPage({ mode: 'signup', returnTo }))
    return true
  }

  if (method === 'POST' && pathname === '/v1/web/signup') {
    const body = isBrowserForm
      ? await (async () => {
          const form = await readFormBody(request)
          return {
            email: form.email ?? '',
            displayName: form.displayName ?? '',
            password: form.password ?? '',
            returnTo: form.return_to ?? '',
          }
        })()
      : await readJsonBody<CloudWebSignupRequest & { returnTo?: string }>(request)
    const email = body.email?.trim() ?? ''
    const displayName = body.displayName?.trim() ?? ''
    const password = body.password?.trim() ?? ''
    const formReturnTo = body.returnTo?.trim() ?? ''
    if (!email || !displayName || !password) {
      if (isBrowserForm || wantsHtml) {
        html(
          request,
          response,
          400,
          renderWebAuthPage({
            mode: 'signup',
            returnTo: formReturnTo,
            error: 'Email, full name, and password are required.',
          }),
        )
      } else {
        json(request, response, 400, {
          error: 'invalid_request',
          message: 'email, displayName, and password are required',
        })
      }
      return true
    }
    if (password.length < 8) {
      if (isBrowserForm || wantsHtml) {
        html(
          request,
          response,
          400,
          renderWebAuthPage({
            mode: 'signup',
            returnTo: formReturnTo,
            error: 'Password must be at least 8 characters long.',
          }),
        )
      } else {
        json(request, response, 400, {
          error: 'invalid_request',
          message: 'Password must be at least 8 characters long',
        })
      }
      return true
    }
    const user = await store.createUserWithPassword({
      email,
      displayName,
      passwordHash: derivePasswordHash(password),
    })
    const verificationToken = crypto.randomUUID()
    await store.saveEmailVerificationToken({
      userId: user.id,
      tokenHash: hashSecret(verificationToken),
      expiresAt: new Date(Date.now() + emailVerificationTtlSeconds * 1000).toISOString(),
    })
    void sendVerificationEmail(user, verificationToken).catch((error) => {
      logAsyncMailFailure('verification', error)
    })
    const sessionResponse = await issueCloudWebSessionResponse(user)
    setCookie(response, WEB_SESSION_COOKIE, sessionResponse.session.accessToken, {
      maxAge: accessTokenLifetimeSeconds,
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
      secure: WEB_SESSION_COOKIE_SECURE,
    })
    if (isBrowserForm || wantsHtml) {
      response.writeHead(302, {
        location: getSafeReturnTo(formReturnTo),
      })
      response.end()
    } else {
      json(request, response, 201, {
        ...sessionResponse,
        requiresEmailVerification: true,
      })
    }
    return true
  }

  if (method === 'POST' && pathname === '/v1/web/login') {
    const body = isBrowserForm
      ? await (async () => {
          const form = await readFormBody(request)
          return {
            email: form.email ?? '',
            password: form.password ?? '',
            returnTo: form.return_to ?? '',
          }
        })()
      : await readJsonBody<CloudWebLoginRequest & { returnTo?: string }>(request)
    const email = body.email?.trim() ?? ''
    const password = body.password?.trim() ?? ''
    const formReturnTo = body.returnTo?.trim() ?? ''
    if (!email || !password) {
      if (isBrowserForm || wantsHtml) {
        html(
          request,
          response,
          400,
          renderWebAuthPage({
            mode: 'login',
            returnTo: formReturnTo,
            error: 'Email and password are required.',
          }),
        )
      } else {
        json(request, response, 400, {
          error: 'invalid_request',
          message: 'email and password are required',
        })
      }
      return true
    }
    const user = await store.authenticateUserWithPassword({
      email,
      password,
      verifyPassword,
    })
    if (!user) {
      if (isBrowserForm || wantsHtml) {
        html(
          request,
          response,
          401,
          renderWebAuthPage({
            mode: 'login',
            returnTo: formReturnTo,
            error: 'Invalid email or password.',
          }),
        )
      } else {
        json(request, response, 401, {
          error: 'invalid_credentials',
          message: 'Invalid email or password',
        })
      }
      return true
    }
    const sessionResponse = await issueCloudWebSessionResponse(user)
    setCookie(response, WEB_SESSION_COOKIE, sessionResponse.session.accessToken, {
      maxAge: accessTokenLifetimeSeconds,
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
      secure: WEB_SESSION_COOKIE_SECURE,
    })
    if (isBrowserForm || wantsHtml) {
      response.writeHead(302, {
        location: getSafeReturnTo(formReturnTo),
      })
      response.end()
    } else {
      json(request, response, 200, sessionResponse)
    }
    return true
  }

  if (method === 'POST' && url === '/v1/web/forgot-password') {
    const body = await readJsonBody<CloudForgotPasswordRequest>(request)
    const email = body.email?.trim() ?? ''
    if (!email) {
      json(request, response, 400, {
        error: 'invalid_request',
        message: 'email is required',
      })
      return true
    }
    const user = await store.getUserByEmail(email)
    if (user) {
      const resetToken = crypto.randomUUID()
      await store.savePasswordResetToken({
        userId: user.id,
        tokenHash: hashSecret(resetToken),
        expiresAt: new Date(Date.now() + passwordResetTtlSeconds * 1000).toISOString(),
      })
      void sendPasswordResetEmail(user, resetToken).catch((error) => {
        logAsyncMailFailure('password reset', error)
      })
    }
    json(request, response, 200, { ok: true })
    return true
  }

  if (method === 'POST' && url === '/v1/web/reset-password') {
    const body = await readJsonBody<CloudResetPasswordRequest>(request)
    const token = body.token?.trim() ?? ''
    const password = body.password?.trim() ?? ''
    if (!token || !password) {
      json(request, response, 400, {
        error: 'invalid_request',
        message: 'token and password are required',
      })
      return true
    }
    if (password.length < 8) {
      json(request, response, 400, {
        error: 'invalid_request',
        message: 'Password must be at least 8 characters long',
      })
      return true
    }
    const user = await store.consumePasswordResetToken(hashSecret(token))
    if (!user) {
      json(request, response, 400, {
        error: 'invalid_token',
        message: 'Invalid or expired password reset token',
      })
      return true
    }
    await store.updateUserPassword(user.id, derivePasswordHash(password))
    void sendPasswordChangedEmail(user).catch((error) => {
      logAsyncMailFailure('password changed', error)
    })
    json(request, response, 200, { ok: true })
    return true
  }

  if (method === 'POST' && url === '/v1/web/verify-email') {
    const body = await readJsonBody<CloudVerifyEmailRequest>(request)
    const token = body.token?.trim() ?? ''
    if (!token) {
      json(request, response, 400, {
        error: 'invalid_request',
        message: 'token is required',
      })
      return true
    }
    const user = await store.consumeEmailVerificationToken(hashSecret(token))
    if (!user) {
      json(request, response, 400, {
        error: 'invalid_token',
        message: 'Invalid or expired email verification token',
      })
      return true
    }
    json(request, response, 200, { ok: true })
    return true
  }

  return false
}
