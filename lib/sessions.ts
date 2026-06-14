import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomBytes } from 'node:crypto'

import type { CredentialRecord } from './types'

const DB_PATH = join(process.cwd(), 'data', 'sessions.db')
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

let db: Database.Database | null = null

function getDb() {
  if (!db) {
    mkdirSync(dirname(DB_PATH), { recursive: true })
    db = new Database(DB_PATH)
    db.exec(`
      CREATE TABLE IF NOT EXISTS verification_sessions (
        session_id TEXT PRIMARY KEY,
        nonce TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        verified_at INTEGER,
        tenant_address TEXT,
        credential_ens_name TEXT,
        credential_json TEXT
      );
    `)
  }
  return db
}

function rowToSession(row: {
  session_id: string
  nonce: string
  status: string
  created_at: number
  expires_at: number
  verified_at: number | null
  tenant_address: string | null
  credential_ens_name: string | null
  credential_json: string | null
}): VerificationSession {
  const now = Math.floor(Date.now() / 1000)
  let status = row.status as SessionStatus
  if (status === 'pending' && row.expires_at < now) {
    status = 'expired'
  }

  return {
    sessionId: row.session_id,
    nonce: row.nonce,
    status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    verifiedAt: row.verified_at,
    tenantAddress: row.tenant_address,
    credentialEnsName: row.credential_ens_name,
    credential: row.credential_json ? (JSON.parse(row.credential_json) as CredentialRecord) : null,
  }
}

export function createVerificationSession(nonce: string): VerificationSession {
  const database = getDb()
  const now = Math.floor(Date.now() / 1000)
  const sessionId = randomBytes(16).toString('hex')

  database
    .prepare(
      `INSERT INTO verification_sessions
       (session_id, nonce, status, created_at, expires_at)
       VALUES (?, ?, 'pending', ?, ?)`,
    )
    .run(sessionId, nonce, now, now + SESSION_TTL_SECONDS)

  return {
    sessionId,
    nonce,
    status: 'pending',
    createdAt: now,
    expiresAt: now + SESSION_TTL_SECONDS,
    verifiedAt: null,
    tenantAddress: null,
    credentialEnsName: null,
    credential: null,
  }
}

export function getVerificationSession(sessionId: string): VerificationSession | null {
  const database = getDb()
  const row = database
    .prepare(`SELECT * FROM verification_sessions WHERE session_id = ?`)
    .get(sessionId) as
    | {
        session_id: string
        nonce: string
        status: string
        created_at: number
        expires_at: number
        verified_at: number | null
        tenant_address: string | null
        credential_ens_name: string | null
        credential_json: string | null
      }
    | undefined

  if (!row) return null
  return rowToSession(row)
}

export function markSessionVerified(
  sessionId: string,
  tenantAddress: string,
  credentialEnsName: string,
  credential: CredentialRecord,
) {
  const database = getDb()
  const now = Math.floor(Date.now() / 1000)

  database
    .prepare(
      `UPDATE verification_sessions
       SET status = 'verified',
           verified_at = ?,
           tenant_address = ?,
           credential_ens_name = ?,
           credential_json = ?
       WHERE session_id = ? AND status = 'pending'`,
    )
    .run(now, tenantAddress.toLowerCase(), credentialEnsName, JSON.stringify(credential), sessionId)
}
