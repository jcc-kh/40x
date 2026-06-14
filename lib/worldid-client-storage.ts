import { getWorldIdAction } from '@/lib/types'

const STORAGE_PREFIX = 'zkcred-worldid'

export interface StoredWorldIdVerification {
  nullifier: string
  verificationSeal?: string
  savedAt: number
}

function storageKey(wallet: string, action = getWorldIdAction()): string {
  return `${STORAGE_PREFIX}:${wallet.toLowerCase()}:${action}`
}

export function saveWorldIdVerification(
  wallet: string,
  data: { nullifier: string; verificationSeal?: string },
  action = getWorldIdAction(),
): void {
  if (typeof window === 'undefined') return
  const payload: StoredWorldIdVerification = {
    nullifier: data.nullifier,
    verificationSeal: data.verificationSeal,
    savedAt: Date.now(),
  }
  localStorage.setItem(storageKey(wallet, action), JSON.stringify(payload))
}

export function loadWorldIdVerification(
  wallet: string,
  action = getWorldIdAction(),
): StoredWorldIdVerification | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(storageKey(wallet, action))
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as StoredWorldIdVerification
    if (!parsed?.nullifier) return null
    return parsed
  } catch {
    return null
  }
}

export function clearWorldIdVerification(wallet: string, action = getWorldIdAction()): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(storageKey(wallet, action))
}
