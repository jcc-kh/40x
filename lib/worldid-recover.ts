import { discoverCredentialForAddress } from '@/lib/ens'
import {
  getNullifierForEnsName,
  getNullifierForWallet,
  hasIssuedCredential,
  hasVerifiedNullifier,
  storeVerifiedNullifier,
} from '@/lib/nullifiers'
import {
  createDemoNullifierForAddress,
  isWorldIdDemoBypassAllowed,
  logWorldIdFailure,
} from '@/lib/worldid'
import { isAddress } from 'viem'

export { isTerminalAlreadyVerifiedError, WORLD_ID_TERMINAL_ALREADY_VERIFIED_CODES } from '@/lib/worldid-errors'

export interface RecoveredWorldIdVerification {
  nullifier: string
  recovered: true
  source: 'ens' | 'local' | 'ens_name' | 'proof' | 'demo'
  alreadyIssuedCredential: boolean
}

export function finalizeReplayedWorldIdVerification(
  nullifier: string,
  signal: string | undefined,
  ensName: string | undefined,
  address: string | undefined,
): RecoveredWorldIdVerification {
  storeVerifiedNullifier(nullifier, signal ?? ensName, address)
  return {
    nullifier,
    recovered: true,
    source: 'proof',
    alreadyIssuedCredential: hasIssuedCredential(nullifier),
  }
}

export function applyDemoWorldIdBypass(
  address: string,
  ensName?: string,
): RecoveredWorldIdVerification {
  const nullifier = createDemoNullifierForAddress(address, ensName)
  storeVerifiedNullifier(nullifier, ensName, address)
  return {
    nullifier,
    recovered: true,
    source: 'demo',
    alreadyIssuedCredential: hasIssuedCredential(nullifier),
  }
}

/** Recover nullifier when World ID reports this human already verified the action. */
export async function recoverAlreadyVerifiedWorldId(
  address: string,
  ensName?: string,
  options?: { allowDemoFallback?: boolean },
): Promise<RecoveredWorldIdVerification | null> {
  if (!isAddress(address)) return null

  const discovered = await discoverCredentialForAddress(address)
  if (discovered?.credential.worldIdNullifier) {
    const nullifier = discovered.credential.worldIdNullifier
    storeVerifiedNullifier(nullifier, discovered.ensName, address)
    return {
      nullifier,
      recovered: true,
      source: 'ens',
      alreadyIssuedCredential: true,
    }
  }

  const stored = getNullifierForWallet(address)
  if (stored) {
    return {
      nullifier: stored,
      recovered: true,
      source: 'local',
      alreadyIssuedCredential: hasIssuedCredential(stored),
    }
  }

  if (ensName) {
    const byEns = getNullifierForEnsName(ensName)
    if (byEns) {
      storeVerifiedNullifier(byEns, ensName, address)
      return {
        nullifier: byEns,
        recovered: true,
        source: 'ens_name',
        alreadyIssuedCredential: hasIssuedCredential(byEns),
      }
    }
  }

  logWorldIdFailure('recoverAlreadyVerifiedWorldId — no nullifier found', {
    address,
    hint: 'User verified on Worldcoin before but this app has no stored nullifier. Use SKIP_WORLD_ID_VERIFY or a new WORLD_ID_ACTION.',
  })

  if (options?.allowDemoFallback !== false && isWorldIdDemoBypassAllowed()) {
    console.info('[World ID] demo bypass — using synthetic nullifier for local demo', {
      address,
      ensName: ensName ?? null,
    })
    return applyDemoWorldIdBypass(address, ensName)
  }

  return null
}

export function ensureNullifierTracked(nullifier: string, ensName: string | undefined, address: string) {
  if (!hasVerifiedNullifier(nullifier)) {
    storeVerifiedNullifier(nullifier, ensName, address)
  }
}
