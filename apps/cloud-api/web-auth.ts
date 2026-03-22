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
  webBaseUrl,
} from './config.ts'
import { issueCloudWebSessionResponse, store } from './context.ts'
import { json, readJsonBody } from './http.ts'
import {
  buildPasswordChangedEmail,
  buildPasswordResetEmail,
  buildVerificationEmail,
  sendMail,
} from './mailer.ts'
import { derivePasswordHash, hashSecret } from './security.ts'

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
  if (method === 'POST' && url === '/v1/web/signup') {
    const body = await readJsonBody<CloudWebSignupRequest>(request)
    const email = body.email?.trim() ?? ''
    const displayName = body.displayName?.trim() ?? ''
    const password = body.password?.trim() ?? ''
    if (!email || !displayName || !password) {
      json(request, response, 400, {
        error: 'invalid_request',
        message: 'email, displayName, and password are required',
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
    json(request, response, 201, {
      ...(await issueCloudWebSessionResponse(user)),
      requiresEmailVerification: true,
    })
    return true
  }

  if (method === 'POST' && url === '/v1/web/login') {
    const body = await readJsonBody<CloudWebLoginRequest>(request)
    const email = body.email?.trim() ?? ''
    const password = body.password?.trim() ?? ''
    if (!email || !password) {
      json(request, response, 400, {
        error: 'invalid_request',
        message: 'email and password are required',
      })
      return true
    }
    const user = await store.authenticateUserWithPassword({
      email,
      passwordHash: derivePasswordHash(password),
    })
    if (!user) {
      json(request, response, 401, {
        error: 'invalid_credentials',
        message: 'Invalid email or password',
      })
      return true
    }
    json(request, response, 200, await issueCloudWebSessionResponse(user))
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
