import Database from 'better-sqlite3'

import { ensureSqliteDirectory, resolveSqlitePath } from '@/lib/sqlite-path'

import { WORLD_ID_ACTION } from './types'

const DB_PATH = resolveSqlitePath('nullifiers.db')

let db: Database.Database | null = null

function getDb() {
  if (!db) {
    ensureSqliteDirectory(DB_PATH)
    db = new Database(DB_PATH)
    db.exec(`
      CREATE TABLE IF NOT EXISTS nullifiers (
        nullifier TEXT NOT NULL,
        action TEXT NOT NULL,
        ens_name TEXT,
        tenant_address TEXT,
        verified_at INTEGER NOT NULL,
        credential_issued INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (nullifier, action)
      );
    `)
    try {
      db.exec(`ALTER TABLE nullifiers ADD COLUMN tenant_address TEXT`)
    } catch {
      // Column already exists.
    }
  }
  return db
}

export function storeVerifiedNullifier(
  nullifier: string,
  ensName?: string,
  tenantAddress?: string,
) {
  const database = getDb()
  database
    .prepare(
      `INSERT INTO nullifiers (nullifier, action, ens_name, tenant_address, verified_at, credential_issued)
       VALUES (?, ?, ?, ?, ?, 0)
       ON CONFLICT(nullifier, action) DO UPDATE SET
         ens_name = excluded.ens_name,
         tenant_address = COALESCE(excluded.tenant_address, nullifiers.tenant_address)`,
    )
    .run(
      nullifier,
      WORLD_ID_ACTION,
      ensName ?? null,
      tenantAddress?.toLowerCase() ?? null,
      Math.floor(Date.now() / 1000),
    )
}

export function getNullifierForWallet(tenantAddress: string): string | null {
  const database = getDb()
  const row = database
    .prepare(
      `SELECT nullifier FROM nullifiers
       WHERE tenant_address = ? AND action = ?
       ORDER BY verified_at DESC
       LIMIT 1`,
    )
    .get(tenantAddress.toLowerCase(), WORLD_ID_ACTION) as { nullifier: string } | undefined
  return row?.nullifier ?? null
}

export function getNullifierForEnsName(ensName: string): string | null {
  const database = getDb()
  const row = database
    .prepare(
      `SELECT nullifier FROM nullifiers
       WHERE ens_name = ? AND action = ?
       ORDER BY verified_at DESC
       LIMIT 1`,
    )
    .get(ensName, WORLD_ID_ACTION) as { nullifier: string } | undefined
  return row?.nullifier ?? null
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

export interface WorldIdVerificationContext {
  verificationSeal?: string
  tenantAddress?: string
  ensName?: string
}

export async function resolveVerifiedNullifier(
  nullifier: string,
  context?: WorldIdVerificationContext,
): Promise<void> {
  if (hasVerifiedNullifier(nullifier)) return

  if (context?.verificationSeal && context.tenantAddress) {
    const { verifyWorldIdVerificationSeal } = await import('@/lib/worldid-seal')
    if (
      verifyWorldIdVerificationSeal(
        context.verificationSeal,
        nullifier,
        context.tenantAddress,
      )
    ) {
      storeVerifiedNullifier(nullifier, context.ensName, context.tenantAddress)
      return
    }
  }

  if (context?.tenantAddress) {
    const { recoverAlreadyVerifiedWorldId } = await import('@/lib/worldid-recover')
    const recovered = await recoverAlreadyVerifiedWorldId(
      context.tenantAddress,
      context.ensName,
      { allowDemoFallback: false },
    )
    if (recovered?.nullifier === nullifier) return
  }

  throw new Error('World ID verification required before document analysis')
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
