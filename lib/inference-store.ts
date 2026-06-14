import Database from 'better-sqlite3'

import { ensureSqliteDirectory, resolveSqlitePath } from '@/lib/sqlite-path'
import type { DocumentAttestation } from './types'

const DB_PATH = resolveSqlitePath('inferences.db')

let db: Database.Database | null = null

function getDb() {
  if (!db) {
    ensureSqliteDirectory(DB_PATH)
    db = new Database(DB_PATH)
    db.exec(`
      CREATE TABLE IF NOT EXISTS inferences (
        inference_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        attestation_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `)
  }
  return db
}

export function storeInferenceQueued(inferenceId: string) {
  const now = Math.floor(Date.now() / 1000)
  getDb()
    .prepare(
      `INSERT INTO inferences (inference_id, status, attestation_json, created_at, updated_at)
       VALUES (?, 'queued', NULL, ?, ?)
       ON CONFLICT(inference_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`,
    )
    .run(inferenceId, now, now)
}

export function storeInferenceCompleted(inferenceId: string, attestation: DocumentAttestation) {
  const now = Math.floor(Date.now() / 1000)
  getDb()
    .prepare(
      `INSERT INTO inferences (inference_id, status, attestation_json, created_at, updated_at)
       VALUES (?, 'completed', ?, ?, ?)
       ON CONFLICT(inference_id) DO UPDATE SET
         status = 'completed',
         attestation_json = excluded.attestation_json,
         updated_at = excluded.updated_at`,
    )
    .run(inferenceId, JSON.stringify(attestation), now, now)
}

export function getInferenceRecord(inferenceId: string): {
  status: string
  attestation: DocumentAttestation | null
} | null {
  const row = getDb()
    .prepare(`SELECT status, attestation_json FROM inferences WHERE inference_id = ?`)
    .get(inferenceId) as { status: string; attestation_json: string | null } | undefined

  if (!row) return null

  return {
    status: row.status,
    attestation: row.attestation_json
      ? (JSON.parse(row.attestation_json) as DocumentAttestation)
      : null,
  }
}
