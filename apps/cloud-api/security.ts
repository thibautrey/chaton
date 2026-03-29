import crypto from 'node:crypto'

const PASSWORD_SCRYPT_KEYLEN = 64
const PASSWORD_SCRYPT_SALT_BYTES = 16

export function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url')
}

export function hashSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex')
}

export function derivePasswordHash(password: string): string {
  const salt = crypto.randomBytes(PASSWORD_SCRYPT_SALT_BYTES).toString('hex')
  const derived = crypto.scryptSync(password, salt, PASSWORD_SCRYPT_KEYLEN).toString('hex')
  return `scrypt$${salt}$${derived}`
}

export function verifyPassword(password: string, passwordHash: string): boolean {
  const [algorithm, salt, expectedHash] = passwordHash.split('$')
  if (algorithm !== 'scrypt' || !salt || !expectedHash) {
    return false
  }

  const derived = crypto.scryptSync(password, salt, PASSWORD_SCRYPT_KEYLEN)
  const expected = Buffer.from(expectedHash, 'hex')
  if (derived.length !== expected.length) {
    return false
  }
  return crypto.timingSafeEqual(derived, expected)
}
