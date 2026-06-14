import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

/** Writable SQLite path — Vercel lambdas only allow writes under /tmp. */
export function resolveSqlitePath(filename: string): string {
  if (process.env.VERCEL) {
    return join(tmpdir(), filename)
  }
  return join(process.cwd(), 'data', filename)
}

export function ensureSqliteDirectory(dbPath: string) {
  mkdirSync(dirname(dbPath), { recursive: true })
}
