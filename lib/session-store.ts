import Database from 'better-sqlite3'

import { ensureSqliteDirectory, resolveSqlitePath } from '@/lib/sqlite-path'

import type { VerificationSession } from './sessions'

const DB_PATH = resolveSqlitePath('sessions.db')

let db: Database.Database | null = null

function getDb() {
  if (!db) {
    ensureSqliteDirectory(DB_PATH)
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

export function loadStoredSession(sessionId: string): VerificationSession | null {
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

  const now = Math.floor(Date.now() / 1000)
  let status = row.status as VerificationSession['status']
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
    credential: row.credential_json
      ? (JSON.parse(row.credential_json) as VerificationSession['credential'])
      : null,
  }
}

/** Best-effort local persistence — on Vercel, signed session seals are the source of truth. */
export function saveStoredSession(session: VerificationSession): void {
  const database = getDb()
  database
    .prepare(
      `INSERT INTO verification_sessions
       (session_id, nonce, status, created_at, expires_at, verified_at, tenant_address, credential_ens_name, credential_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(session_id) DO UPDATE SET
         nonce = excluded.nonce,
         status = excluded.status,
         created_at = excluded.created_at,
         expires_at = excluded.expires_at,
         verified_at = excluded.verified_at,
         tenant_address = excluded.tenant_address,
         credential_ens_name = excluded.credential_ens_name,
         credential_json = excluded.credential_json`,
    )
    .run(
      session.sessionId,
      session.nonce,
      session.status,
      session.createdAt,
      session.expiresAt,
      session.verifiedAt,
      session.tenantAddress,
      session.credentialEnsName,
      session.credential ? JSON.stringify(session.credential) : null,
    )
}
