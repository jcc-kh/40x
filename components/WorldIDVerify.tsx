'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { IDKitRequestWidget, proofOfHuman, type RpContext } from '@worldcoin/idkit'
import type { Address } from 'viem'

import { getWorldIdAction } from '@/lib/types'
import { isTerminalAlreadyVerifiedError } from '@/lib/worldid-errors'
import {
  loadWorldIdVerification,
  saveWorldIdVerification,
} from '@/lib/worldid-client-storage'

export interface WorldIdVerifiedMeta {
  recovered?: boolean
  alreadyIssuedCredential?: boolean
  verificationSeal?: string
}

interface WorldIDVerifyProps {
  signal: string
  address?: Address
  action?: string
  onVerified: (nullifier: string, meta?: WorldIdVerifiedMeta) => void
  onError: (message: string) => void
  deferBackendVerify?: boolean
}

const showDevSkip =
  process.env.NODE_ENV !== 'production' ||
  process.env.NEXT_PUBLIC_SKIP_WORLD_ID_VERIFY === 'true'

function formatClientWorldIdError(
  source: string,
  error: unknown,
  extra?: Record<string, unknown>,
): string {
  const base =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : JSON.stringify(error)

  console.error(`[World ID client] ${source}`, { error, ...extra })
  return base
}

async function recoverAlreadyVerified(
  address: Address,
  signal: string,
): Promise<{
  nullifier: string
  alreadyIssuedCredential: boolean
  verificationSeal?: string
} | null> {
  const response = await fetch('/api/world-id/recover', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ address, signal }),
  })
  const data = await response.json()
  if (!response.ok) return null
  return {
    nullifier: data.nullifier,
    alreadyIssuedCredential: Boolean(data.alreadyIssuedCredential),
    verificationSeal: data.verificationSeal,
  }
}

export function WorldIDVerify({
  signal,
  address,
  action = getWorldIdAction(),
  onVerified,
  onError,
  deferBackendVerify,
}: WorldIDVerifyProps) {
  const [open, setOpen] = useState(false)
  const [rpContext, setRpContext] = useState<RpContext | null>(null)
  const [loading, setLoading] = useState(false)
  const [recovering, setRecovering] = useState(false)
  const autoCheckedRef = useRef(false)
  const advancedRef = useRef(false)
  const lastProofRef = useRef<unknown>(null)

  const advanceWithNullifier = useCallback(
    (nullifier: string, meta?: WorldIdVerifiedMeta) => {
      if (advancedRef.current) return
      advancedRef.current = true
      setOpen(false)
      if (address && nullifier) {
        saveWorldIdVerification(address, {
          nullifier,
          verificationSeal: meta?.verificationSeal,
        })
      }
      onVerified(nullifier, meta)
    },
    [address, onVerified],
  )

  const tryRecoverAndContinue = useCallback(
    async (errorSource: string, error: unknown, idkitResult?: unknown) => {
      if (advancedRef.current) return

      setOpen(false)

      if (idkitResult && address) {
        setRecovering(true)
        try {
          const response = await fetch('/api/world-id/verify', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ idkitResponse: idkitResult, signal, address }),
          })
          const data = await response.json()
          if (response.ok && data.nullifier) {
            console.info('[World ID client] replayed proof registered on server', {
              errorSource,
              recovered: data.recovered,
            })
            advanceWithNullifier(data.nullifier, {
              recovered: true,
              alreadyIssuedCredential: Boolean(data.alreadyIssuedCredential),
              verificationSeal: data.verificationSeal,
            })
            return
          }
        } finally {
          setRecovering(false)
        }
      }

      if (!address) {
        onError(formatClientWorldIdError(errorSource, error, { action, signal }))
        return
      }

      console.info('[World ID client] terminal already-verified — attempting recover', {
        error,
        address,
      })

      setRecovering(true)
      try {
        const recovered = await recoverAlreadyVerified(address, signal)
        if (recovered) {
          console.info('[World ID client] recover success — continuing flow', recovered)
          advanceWithNullifier(recovered.nullifier, {
            recovered: true,
            alreadyIssuedCredential: recovered.alreadyIssuedCredential,
            verificationSeal: recovered.verificationSeal,
          })
          return
        }
      } finally {
        setRecovering(false)
      }

      onError(
        isTerminalAlreadyVerifiedError(error)
          ? 'Already verified on Worldcoin for this action, but this app has no saved nullifier. ' +
              'Scan again in World App (fresh proof), or add a new action at developer.world.org and set WORLD_ID_ACTION in env. ' +
              'For local testing, set SKIP_WORLD_ID_VERIFY=true and use "Dev: skip World ID".'
          : `Already verified on Worldcoin, but this app has no saved nullifier for your wallet. ` +
              `Enable SKIP_WORLD_ID_VERIFY=true for local dev, or add a new WORLD_ID_ACTION in developer.world.org.`,
      )
    },
    [action, address, advanceWithNullifier, onError, signal],
  )

  useEffect(() => {
    async function loadRpContext() {
      setLoading(true)
      setRpContext(null)
      try {
        const response = await fetch('/api/world-id/rp-signature', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action }),
        })

        const data = await response.json()
        if (!response.ok) {
          throw new Error(data.error ?? 'Failed to fetch RP signature')
        }

        console.info('[World ID client] rp_context ready', {
          action,
          signal,
          rp_id: data.rp_id,
        })

        setRpContext({
          rp_id: data.rp_id,
          nonce: data.nonce,
          created_at: data.created_at,
          expires_at: data.expires_at,
          signature: data.sig,
        })
      } catch (error) {
        onError(formatClientWorldIdError('rp-signature failed', error, { action, signal }))
      } finally {
        setLoading(false)
      }
    }

    void loadRpContext()
  }, [action, onError, signal])

  useEffect(() => {
    if (!address || !rpContext || autoCheckedRef.current) return
    autoCheckedRef.current = true

    void (async () => {
      const cached = loadWorldIdVerification(address)
      if (cached?.nullifier) {
        console.info('[World ID client] restored verification from browser storage', {
          nullifier: cached.nullifier.slice(0, 16) + '…',
        })
        advanceWithNullifier(cached.nullifier, {
          recovered: true,
          verificationSeal: cached.verificationSeal,
        })
        return
      }

      setRecovering(true)
      try {
        const recovered = await recoverAlreadyVerified(address, signal)
        if (recovered) {
          console.info('[World ID client] auto-recover on mount — skipping World ID step', recovered)
          advanceWithNullifier(recovered.nullifier, {
            recovered: true,
            alreadyIssuedCredential: recovered.alreadyIssuedCredential,
            verificationSeal: recovered.verificationSeal,
          })
        }
      } finally {
        setRecovering(false)
      }
    })()
  }, [address, advanceWithNullifier, rpContext, signal])

  if (loading || recovering) {
    return (
      <p className="text-sm text-zinc-500">
        {recovering ? 'Checking existing World ID verification…' : 'Preparing World ID verification…'}
      </p>
    )
  }

  if (!rpContext) {
    return (
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded bg-black px-6 py-2 text-white"
      >
        Retry World ID setup
      </button>
    )
  }

  return (
    <>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded bg-black px-6 py-2 text-white"
        >
          Prove with World ID
        </button>
        {showDevSkip ? (
          <button
            type="button"
            onClick={() => {
              void (async () => {
                try {
                  const response = await fetch('/api/world-id/verify', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ signal, devBypass: true, address }),
                  })
                  const data = await response.json()
                  if (!response.ok) {
                    throw new Error(data.error ?? 'Dev bypass failed')
                  }
                  advanceWithNullifier(data.nullifier, {
                    recovered: true,
                    verificationSeal: data.verificationSeal,
                  })
                } catch (error) {
                  onError(error instanceof Error ? error.message : 'Dev bypass failed')
                }
              })()
            }}
            className="rounded border border-amber-400 bg-amber-50 px-6 py-2 text-sm text-amber-900"
          >
            Dev: skip World ID
          </button>
        ) : null}
        {address ? (
          <button
            type="button"
            disabled={recovering}
            onClick={() => void tryRecoverAndContinue('manual recover', 'already_verified')}
            className="rounded border border-zinc-300 bg-white px-6 py-2 text-sm text-zinc-800 disabled:opacity-50"
          >
            Already verified — continue
          </button>
        ) : null}
      </div>

      <IDKitRequestWidget
        open={open}
        onOpenChange={setOpen}
        app_id={process.env.NEXT_PUBLIC_WORLD_APP_ID as `app_${string}`}
        action={action}
        rp_context={rpContext}
        allow_legacy_proofs={true}
        preset={proofOfHuman({ signal })}
        handleVerify={async (result) => {
          lastProofRef.current = result

          if (deferBackendVerify) {
            advanceWithNullifier('', { recovered: false })
            return
          }

          const response = await fetch('/api/world-id/verify', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ idkitResponse: result, signal, address }),
          })

          const data = await response.json()
          if (!response.ok) {
            console.error('[World ID client] backend verify failed', {
              status: response.status,
              code: data.code,
              details: data.details,
              error: data.error,
            })
            if (isTerminalAlreadyVerifiedError(data.code ?? data.error)) {
              await tryRecoverAndContinue('backend verify', data.code ?? data.error, result)
              return
            }
            throw new Error(
              data.code
                ? `${data.code}: ${data.error ?? 'Backend verification failed'}`
                : (data.error ?? 'Backend verification failed'),
            )
          }

          if (!data.verificationSeal && address && process.env.NODE_ENV === 'production') {
            console.warn(
              '[World ID client] verify succeeded without verificationSeal — attester submit may fail on Vercel',
            )
          }

          console.info('[World ID client] backend verify success', {
            recovered: data.recovered,
          })
          advanceWithNullifier(data.nullifier, {
            recovered: Boolean(data.recovered),
            alreadyIssuedCredential: Boolean(data.alreadyIssuedCredential),
            verificationSeal: data.verificationSeal,
          })
        }}
        onSuccess={() => setOpen(false)}
        onError={(error) => {
          void (async () => {
            if (isTerminalAlreadyVerifiedError(error)) {
              await tryRecoverAndContinue('IDKit widget', error, lastProofRef.current)
              return
            }
            onError(
              formatClientWorldIdError('IDKit widget error', error, {
                action,
                signal,
              }),
            )
          })()
        }}
      />
    </>
  )
}
