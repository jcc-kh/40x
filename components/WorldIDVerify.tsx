'use client'

import { useEffect, useState } from 'react'
import { IDKitRequestWidget, proofOfHuman, type RpContext } from '@worldcoin/idkit'

import { WORLD_ID_ACTION } from '@/lib/types'

interface WorldIDVerifyProps {
  signal: string
  action?: string
  onVerified: (nullifier: string, idkitResponse: unknown) => void
  onError: (message: string) => void
  /** Defer Worldcoin verify to session/complete (presentation flow). */
  deferBackendVerify?: boolean
}

export function WorldIDVerify({
  signal,
  action = WORLD_ID_ACTION,
  onVerified,
  onError,
  deferBackendVerify,
}: WorldIDVerifyProps) {
  const [open, setOpen] = useState(false)
  const [rpContext, setRpContext] = useState<RpContext | null>(null)
  const [loading, setLoading] = useState(false)

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

        setRpContext({
          rp_id: data.rp_id,
          nonce: data.nonce,
          created_at: data.created_at,
          expires_at: data.expires_at,
          signature: data.sig,
        })
      } catch (error) {
        onError(error instanceof Error ? error.message : 'Failed to initialize World ID')
      } finally {
        setLoading(false)
      }
    }

    void loadRpContext()
  }, [action, onError])

  if (loading) {
    return <p className="text-sm text-zinc-500">Preparing World ID verification...</p>
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
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded bg-black px-6 py-2 text-white"
      >
        Prove with World ID
      </button>

      <IDKitRequestWidget
        open={open}
        onOpenChange={setOpen}
        app_id={process.env.NEXT_PUBLIC_WORLD_APP_ID as `app_${string}`}
        action={action}
        rp_context={rpContext}
        allow_legacy_proofs={true}
        preset={proofOfHuman({ signal })}
        handleVerify={async (result) => {
          if (deferBackendVerify) {
            onVerified('', result)
            return
          }

          const response = await fetch('/api/world-id/verify', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ idkitResponse: result, signal }),
          })

          const data = await response.json()
          if (!response.ok) {
            throw new Error(data.error ?? 'Backend verification failed')
          }

          onVerified(data.nullifier, result)
        }}
        onSuccess={() => setOpen(false)}
        onError={(error) => onError(error ?? 'World ID verification failed')}
      />
    </>
  )
}
