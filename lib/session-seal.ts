import { createHmac, timingSafeEqual } from 'node:crypto'

function getSealKey(): string {
  const key = process.env.RP_SIGNING_KEY ?? process.env.SESSION_SIGNING_KEY
  if (!key) {
    throw new Error('RP_SIGNING_KEY is not configured')
  }
  return key
}

export interface VerifiedSessionSealPayload {
  sessionId: string
  nonce: string
  expiresAt: number
  tenantAddress: string
  credentialEnsName: string
  credentialJson: string
  verifiedAt: number
}

/** Stateless proof of a pending landlord session (works when SQLite is empty on another lambda). */
export function issueSessionSeal(sessionId: string, nonce: string, expiresAt: number): string {
  const payload = `${sessionId}|${nonce}|${expiresAt}`
  const mac = createHmac('sha256', getSealKey()).update(payload).digest('hex')
  return `${payload}|${mac}`
}

export function verifySessionSeal(
  seal: string,
  expectedSessionId?: string,
): { sessionId: string; nonce: string; expiresAt: number } | null {
  try {
    const parts = seal.split('|')
    if (parts.length !== 4) return null

    const [sessionId, nonce, expiresAtStr, mac] = parts
    if (expectedSessionId && sessionId !== expectedSessionId) return null

    const expiresAt = Number.parseInt(expiresAtStr, 10)
    if (!Number.isFinite(expiresAt)) return null

    const payload = `${sessionId}|${nonce}|${expiresAtStr}`
    const expected = createHmac('sha256', getSealKey()).update(payload).digest('hex')
    const actual = Buffer.from(mac, 'hex')
    const expectedBuf = Buffer.from(expected, 'hex')
    if (actual.length !== expectedBuf.length || !timingSafeEqual(actual, expectedBuf)) {
      return null
    }

    return { sessionId, nonce, expiresAt }
  } catch {
    return null
  }
}

/** Tamper-proof snapshot returned to the landlord after tenant completes screening. */
export function issueVerifiedSessionSeal(payload: VerifiedSessionSealPayload): string {
  const credentialB64 = Buffer.from(payload.credentialJson, 'utf8').toString('base64url')
  const fields = [
    payload.sessionId,
    payload.nonce,
    String(payload.expiresAt),
    payload.tenantAddress.toLowerCase(),
    payload.credentialEnsName,
    credentialB64,
    String(payload.verifiedAt),
  ]
  const body = fields.join('|')
  const mac = createHmac('sha256', getSealKey()).update(body).digest('hex')
  return `${body}|${mac}`
}

export function verifyVerifiedSessionSeal(
  seal: string,
  expectedSessionId?: string,
): (VerifiedSessionSealPayload & { status: 'verified' }) | null {
  try {
    const lastPipe = seal.lastIndexOf('|')
    if (lastPipe <= 0) return null

    const mac = seal.slice(lastPipe + 1)
    const body = seal.slice(0, lastPipe)
    const parts = body.split('|')
    if (parts.length !== 7) return null

    const [
      sessionId,
      nonce,
      expiresAtStr,
      tenantAddress,
      credentialEnsName,
      credentialB64,
      verifiedAtStr,
    ] = parts

    if (expectedSessionId && sessionId !== expectedSessionId) return null

    const expiresAt = Number.parseInt(expiresAtStr, 10)
    const verifiedAt = Number.parseInt(verifiedAtStr, 10)
    if (!Number.isFinite(expiresAt) || !Number.isFinite(verifiedAt)) return null

    const expected = createHmac('sha256', getSealKey()).update(body).digest('hex')
    const actual = Buffer.from(mac, 'hex')
    const expectedBuf = Buffer.from(expected, 'hex')
    if (actual.length !== expectedBuf.length || !timingSafeEqual(actual, expectedBuf)) {
      return null
    }

    const credentialJson = Buffer.from(credentialB64, 'base64url').toString('utf8')

    return {
      sessionId,
      nonce,
      expiresAt,
      tenantAddress,
      credentialEnsName,
      credentialJson,
      verifiedAt,
      status: 'verified',
    }
  } catch {
    return null
  }
}
