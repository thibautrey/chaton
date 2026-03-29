import crypto from 'node:crypto'

// scrypt parameters - using higher values for better security
// N = 2^14 = 16384 iterations, r = 8, p = 1
// These values are chosen to provide strong security while maintaining reasonable performance
const PASSWORD_SCRYPT_N = 1 << 14
const PASSWORD_SCRYPT_R = 8
const PASSWORD_SCRYPT_P = 1
const PASSWORD_SCRYPT_KEYLEN = 64
const PASSWORD_SCRYPT_SALT_BYTES = 32 // 256-bit salt for better entropy

export function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url')
}

export function hashSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex')
}

export function derivePasswordHash(password: string): string {
  const salt = crypto.randomBytes(PASSWORD_SCRYPT_SALT_BYTES).toString('hex')
  const derived = crypto.scryptSync(password, salt, PASSWORD_SCRYPT_KEYLEN, {
    N: PASSWORD_SCRYPT_N,
    r: PASSWORD_SCRYPT_R,
    p: PASSWORD_SCRYPT_P,
  }).toString('hex')
  return `scrypt$${PASSWORD_SCRYPT_N}$${PASSWORD_SCRYPT_R}$${PASSWORD_SCRYPT_P}$${salt}$${derived}`
}

export function verifyPassword(password: string, passwordHash: string): boolean {
  const parts = passwordHash.split('$')
  if (parts[0] !== 'scrypt' || parts.length < 6) {
    return false
  }

  const [, nStr, rStr, pStr, salt, expectedHash] = parts
  const N = Number.parseInt(nStr, 10)
  const r = Number.parseInt(rStr, 10)
  const p = Number.parseInt(pStr, 10)

  if (!N || !r || !p || !salt || !expectedHash) {
    return false
  }

  const derived = crypto.scryptSync(password, salt, PASSWORD_SCRYPT_KEYLEN, { N, r, p })
  const expected = Buffer.from(expectedHash, 'hex')
  if (derived.length !== expected.length) {
    return false
  }
  return crypto.timingSafeEqual(derived, expected)
}
