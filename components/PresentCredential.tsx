'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAccount, usePublicClient, useSignMessage } from 'wagmi'

import { ConnectWallet } from '@/components/ConnectWallet'
import { WorldIDVerify } from '@/components/WorldIDVerify'
import { getEnsChainId } from '@/lib/ens'
import { buildPresentationSiweMessage } from '@/lib/siwe'

export function PresentCredential() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session') ?? ''
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { signMessageAsync } = useSignMessage()

  const [nonce, setNonce] = useState('')
  const [presentationSignal, setPresentationSignal] = useState<string | null>(null)
  const [idkitResponse, setIdkitResponse] = useState<unknown>(null)
  const [worldIdDone, setWorldIdDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const loadSession = useCallback(async () => {
    if (!sessionId) {
      setError('Missing session ID')
      return
    }

    const response = await fetch(`/api/session/${sessionId}`)
    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.error ?? 'Failed to load session')
    }

    if (data.status === 'verified') {
      setDone(true)
      return
    }

    if (data.status === 'expired') {
      throw new Error('This verification session has expired')
    }

    setNonce(data.nonce ?? '')
  }, [sessionId])

  useEffect(() => {
    void loadSession().catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load session')
    })
  }, [loadSession])

  useEffect(() => {
    if (!address) return

    async function loadCredentialTarget() {
      const response = await fetch(`/api/credential/discover?address=${address}`)
      const data = await response.json()
      if (response.ok) {
        const signal =
          data.credential?.accessSubname || data.ensName || data.publishTarget || null
        setPresentationSignal(signal)
      }
    }

    void loadCredentialTarget()
  }, [address])

  async function handlePresent() {
    if (!address || !sessionId || !nonce || !idkitResponse) return

    setSubmitting(true)
    setError('')

    try {
      const domain = window.location.hostname
      const message = buildPresentationSiweMessage({
        address,
        domain,
        uri: window.location.origin,
        nonce,
        chainId: getEnsChainId(),
      })

      const signature = await signMessageAsync({ message })

      const response = await fetch('/api/session/complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message,
          signature,
          address,
          idkitResponse,
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error ?? 'Presentation failed')
      }

      setDone(true)
    } catch (presentError) {
      setError(presentError instanceof Error ? presentError.message : 'Presentation failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (!sessionId) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-4 text-red-700">
        Invalid presentation link — missing session.
      </div>
    )
  }

  if (done) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-center">
        <p className="text-2xl">✅</p>
        <h2 className="mt-2 text-xl font-semibold">Credential presented</h2>
        <p className="mt-2 text-sm text-zinc-600">
          The landlord can now see your verified screening credential on their device.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="rounded border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        A landlord requested live proof that you hold a screening credential. Connect the wallet that
        published your credential, verify with World ID, then sign once.
      </div>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-red-700">{error}</div>
      ) : null}

      <section className="rounded-lg border p-6">
        <h2 className="mb-4 text-xl font-semibold">Step 1: Connect wallet</h2>
        <ConnectWallet />
        {isConnected && address ? (
          <p className="mt-3 text-sm text-zinc-500">
            {presentationSignal
              ? `Credential location: ${presentationSignal}`
              : 'Looking up credential on ENS…'}
          </p>
        ) : null}
      </section>

      {isConnected && address && presentationSignal ? (
        <section className="rounded-lg border p-6">
          <h2 className="mb-4 text-xl font-semibold">Step 2: Prove you&apos;re the holder</h2>
          <p className="mb-4 text-sm text-zinc-600">
            World ID nullifier must match the credential bound at issuance.
          </p>
          <WorldIDVerify
            signal={presentationSignal}
            skipDuplicateCheck
            onVerified={(_nullifier, response) => {
              setIdkitResponse(response)
              setWorldIdDone(true)
            }}
            onError={setError}
          />
        </section>
      ) : null}

      {isConnected && worldIdDone ? (
        <section className="rounded-lg border p-6">
          <h2 className="mb-4 text-xl font-semibold">Step 3: Sign presentation</h2>
          <p className="mb-4 text-sm text-zinc-600">
            Sign a message to confirm wallet control for this verification session.
          </p>
          <button
            type="button"
            onClick={() => void handlePresent()}
            disabled={submitting || !publicClient}
            className="rounded bg-black px-6 py-2 text-white disabled:opacity-50"
          >
            {submitting ? 'Submitting…' : 'Sign and present credential'}
          </button>
        </section>
      ) : null}
    </div>
  )
}
