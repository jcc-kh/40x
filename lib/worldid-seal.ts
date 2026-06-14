import { createHmac, timingSafeEqual } from 'node:crypto'

const SEAL_TTL_SEC = 2 * 60 * 60

function getSealKey(): string {
  const key = process.env.RP_SIGNING_KEY
  if (!key) {
    throw new Error('RP_SIGNING_KEY is not configured')
  }
  return key
}

/** Serverless-safe proof that /api/world-id/verify succeeded for this wallet. */
export function issueWorldIdVerificationSeal(nullifier: string, tenantAddress: string): string {
  const exp = Math.floor(Date.now() / 1000) + SEAL_TTL_SEC
  const normalizedAddress = tenantAddress.toLowerCase()
  const payload = `${nullifier}|${normalizedAddress}|${exp}`
  const mac = createHmac('sha256', getSealKey()).update(payload).digest('hex')
  return `${payload}|${mac}`
}

export function verifyWorldIdVerificationSeal(
  seal: string,
  nullifier: string,
  tenantAddress: string,
): boolean {
  try {
    const parts = seal.split('|')
    if (parts.length !== 4) return false

    const [sealNullifier, sealAddress, expStr, mac] = parts
    if (sealNullifier !== nullifier) return false
    if (sealAddress !== tenantAddress.toLowerCase()) return false

    const exp = Number.parseInt(expStr, 10)
    if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false

    const payload = `${sealNullifier}|${sealAddress}|${expStr}`
    const expected = createHmac('sha256', getSealKey()).update(payload).digest('hex')
    const actual = Buffer.from(mac, 'hex')
    const expectedBuf = Buffer.from(expected, 'hex')
    if (actual.length !== expectedBuf.length) return false

    return timingSafeEqual(actual, expectedBuf)
  } catch {
    return false
  }
}
