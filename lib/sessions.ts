import { randomBytes } from 'node:crypto'

import { loadStoredSession, saveStoredSession } from '@/lib/session-store'
import {
  issueSessionSeal,
  issueVerifiedSessionSeal,
  verifySessionSeal,
  verifyVerifiedSessionSeal,
} from '@/lib/session-seal'
import type { CredentialRecord } from './types'

const SESSION_TTL_SECONDS = 60 * 60 * 24

export type SessionStatus = 'pending' | 'verified' | 'expired'

export interface VerificationSession {
  sessionId: string
  nonce: string
  status: SessionStatus
  createdAt: number
  expiresAt: number
  verifiedAt: number | null
  tenantAddress: string | null
  credentialEnsName: string | null
  credential: CredentialRecord | null
}

export interface CreatedVerificationSession extends VerificationSession {
  sessionSeal: string
}

function normalizeStatus(session: VerificationSession): VerificationSession {
  const now = Math.floor(Date.now() / 1000)
  if (session.status === 'pending' && session.expiresAt < now) {
    return { ...session, status: 'expired' }
  }
  return session
}

export function sessionFromSeal(sessionId: string, seal: string): VerificationSession | null {
  const verified = verifyVerifiedSessionSeal(seal, sessionId)
  if (verified) {
    return normalizeStatus({
      sessionId: verified.sessionId,
      nonce: verified.nonce,
      status: 'verified',
      createdAt: verified.verifiedAt,
      expiresAt: verified.expiresAt,
      verifiedAt: verified.verifiedAt,
      tenantAddress: verified.tenantAddress,
      credentialEnsName: verified.credentialEnsName,
      credential: JSON.parse(verified.credentialJson) as CredentialRecord,
    })
  }

  const parsed = verifySessionSeal(seal, sessionId)
  if (!parsed) return null

  const now = Math.floor(Date.now() / 1000)
  return {
    sessionId: parsed.sessionId,
    nonce: parsed.nonce,
    status: parsed.expiresAt < now ? 'expired' : 'pending',
    createdAt: now,
    expiresAt: parsed.expiresAt,
    verifiedAt: null,
    tenantAddress: null,
    credentialEnsName: null,
    credential: null,
  }
}

export function createVerificationSession(nonce: string): CreatedVerificationSession {
  const now = Math.floor(Date.now() / 1000)
  const sessionId = randomBytes(16).toString('hex')
  const expiresAt = now + SESSION_TTL_SECONDS

  const session: CreatedVerificationSession = {
    sessionId,
    nonce,
    status: 'pending',
    createdAt: now,
    expiresAt,
    verifiedAt: null,
    tenantAddress: null,
    credentialEnsName: null,
    credential: null,
    sessionSeal: issueSessionSeal(sessionId, nonce, expiresAt),
  }

  saveStoredSession(session)
  return session
}

export function getVerificationSession(
  sessionId: string,
  seal?: string,
): VerificationSession | null {
  if (seal) {
    const fromSeal = sessionFromSeal(sessionId, seal)
    if (fromSeal) return fromSeal
  }

  const stored = loadStoredSession(sessionId)
  if (stored) return normalizeStatus(stored)
  return null
}

export function markSessionVerified(
  sessionId: string,
  tenantAddress: string,
  credentialEnsName: string,
  credential: CredentialRecord,
  seal?: string,
) {
  const now = Math.floor(Date.now() / 1000)
  const existing =
    loadStoredSession(sessionId) ?? (seal ? sessionFromSeal(sessionId, seal) : null)

  if (!existing || existing.status === 'expired') {
    throw new Error('Session not found or expired')
  }

  const verified: VerificationSession = {
    ...existing,
    status: 'verified',
    verifiedAt: now,
    tenantAddress: tenantAddress.toLowerCase(),
    credentialEnsName,
    credential,
  }

  saveStoredSession(verified)
  return issueVerifiedSessionSeal({
    sessionId,
    nonce: existing.nonce,
    expiresAt: existing.expiresAt,
    tenantAddress: tenantAddress.toLowerCase(),
    credentialEnsName,
    credentialJson: JSON.stringify(credential),
    verifiedAt: now,
  })
}
