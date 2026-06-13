import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { WORLD_ID_ACTION } from './types'

const DB_PATH = join(process.cwd(), 'data', 'nullifiers.db')

let db: Database.Database | null = null

function getDb() {
  if (!db) {
    mkdirSync(dirname(DB_PATH), { recursive: true })
    db = new Database(DB_PATH)
    db.exec(`
      CREATE TABLE IF NOT EXISTS nullifiers (
        nullifier TEXT NOT NULL,
        action TEXT NOT NULL,
        ens_name TEXT,
        verified_at INTEGER NOT NULL,
        credential_issued INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (nullifier, action)
      );
    `)
  }
  return db
}

export function storeVerifiedNullifier(nullifier: string, ensName?: string) {
  const database = getDb()
  database
    .prepare(
      `INSERT INTO nullifiers (nullifier, action, ens_name, verified_at, credential_issued)
       VALUES (?, ?, ?, ?, 0)
       ON CONFLICT(nullifier, action) DO UPDATE SET ens_name = excluded.ens_name`,
    )
    .run(nullifier, WORLD_ID_ACTION, ensName ?? null, Math.floor(Date.now() / 1000))
}

export function markCredentialIssued(nullifier: string) {
  const database = getDb()
  database
    .prepare(
      `UPDATE nullifiers SET credential_issued = 1 WHERE nullifier = ? AND action = ?`,
    )
    .run(nullifier, WORLD_ID_ACTION)
}

export function hasVerifiedNullifier(nullifier: string): boolean {
  const database = getDb()
  const row = database
    .prepare(`SELECT 1 FROM nullifiers WHERE nullifier = ? AND action = ?`)
    .get(nullifier, WORLD_ID_ACTION)
  return Boolean(row)
}

export function hasIssuedCredential(nullifier: string): boolean {
  const database = getDb()
  const row = database
    .prepare(
      `SELECT credential_issued FROM nullifiers WHERE nullifier = ? AND action = ?`,
    )
    .get(nullifier, WORLD_ID_ACTION) as { credential_issued: number } | undefined
  return Boolean(row?.credential_issued)
}

export function assertNullifierVerified(nullifier: string) {
  if (!hasVerifiedNullifier(nullifier)) {
    throw new Error('World ID verification required before document analysis')
  }
}

export function assertNoExistingCredential(nullifier: string) {
  if (hasIssuedCredential(nullifier)) {
    throw new Error('This human already has a credential')
  }
}
