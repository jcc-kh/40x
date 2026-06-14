'use client'

import { useEffect, useState } from 'react'
import { IDKitRequestWidget, proofOfHuman, type RpContext } from '@worldcoin/idkit'

interface WorldIDVerifyProps {
  signal: string
  onVerified: (nullifier: string, idkitResponse: unknown) => void
  onError: (message: string) => void
  skipDuplicateCheck?: boolean
}

export function WorldIDVerify({ signal, onVerified, onError, skipDuplicateCheck }: WorldIDVerifyProps) {
  const [open, setOpen] = useState(false)
  const [rpContext, setRpContext] = useState<RpContext | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    async function loadRpContext() {
      setLoading(true)
      try {
        const response = await fetch('/api/world-id/rp-signature', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'verify-credential' }),
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
  }, [onError])

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
        Prove uniqueness with World ID
      </button>

      <IDKitRequestWidget
        open={open}
        onOpenChange={setOpen}
        app_id={process.env.NEXT_PUBLIC_WORLD_APP_ID as `app_${string}`}
        action="verify-credential"
        rp_context={rpContext}
        allow_legacy_proofs={true}
        preset={proofOfHuman({ signal })}
        handleVerify={async (result) => {
          const endpoint = skipDuplicateCheck ? '/api/world-id/verify-presentation' : '/api/world-id/verify'
          const response = await fetch(endpoint, {
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
