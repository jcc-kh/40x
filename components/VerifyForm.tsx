'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

import { CredentialCard } from '@/components/CredentialCard'
import type { CredentialRecord } from '@/lib/types'

export function VerifyForm() {
  const searchParams = useSearchParams()
  const [ensName, setEnsName] = useState('')
  const [loading, setLoading] = useState(false)
  const [credential, setCredential] = useState<CredentialRecord | null>(null)
  const [resolvedName, setResolvedName] = useState('')
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const preset = searchParams.get('ensName')
    if (preset) {
      setEnsName(preset)
    }
  }, [searchParams])

  async function handleVerify() {
    if (!ensName.endsWith('.eth')) return

    setLoading(true)
    setNotFound(false)
    setCredential(null)
    setError('')

    try {
      const response = await fetch(`/api/credential?ensName=${encodeURIComponent(ensName)}`)
      const data = await response.json()

      if (!response.ok) {
        if (response.status === 404) {
          setNotFound(true)
          return
        }
        throw new Error(data.error ?? 'Failed to load credential')
      }

      setResolvedName(data.ensName)
      setCredential(data.credential)
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : 'Verification failed')
    } finally {
      setLoading(false)
    }
  }

  const expiresAt = credential ? Number.parseInt(credential.expiresAt, 10) : 0
  const isExpired = credential ? expiresAt < Math.floor(Date.now() / 1000) : false

  return (
    <>
      <div className="mb-8 flex gap-3">
        <input
          type="text"
          placeholder="screening.alice.eth"
          value={ensName}
          onChange={(event) => setEnsName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void handleVerify()
          }}
          className="flex-1 rounded border p-3 text-lg"
        />
        <button
          type="button"
          onClick={() => void handleVerify()}
          disabled={loading || !ensName.endsWith('.eth')}
          className="rounded bg-black px-6 py-3 text-white disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Verify'}
        </button>
      </div>

      <p className="mb-6 text-sm text-zinc-500">
        Enter the access subname the tenant shared — not their primary ENS identity.
      </p>

      {error ? <div className="mb-6 rounded border border-red-200 bg-red-50 p-3 text-red-700">{error}</div> : null}

      {notFound ? (
        <div className="rounded-lg border p-6 text-center text-zinc-500">
          No credential found for {ensName}
        </div>
      ) : null}

      {credential ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-4xl">
              {credential.verified === 'true' && !isExpired ? '✅' : '⚠️'}
            </span>
            <div>
              <h2 className="text-xl font-semibold">{resolvedName}</h2>
              <p className="text-sm text-zinc-500">
                {isExpired ? 'Credential expired' : 'Screening credential valid'}
              </p>
            </div>
          </div>

          <CredentialCard
            ensName={resolvedName}
            attestation={{
              verified: credential.verified === 'true',
              documentOwnershipVerified: credential.documentOwnershipVerified === 'true',
              documentsConsistent: credential.documentsConsistent === 'true',
              incomeVerified: credential.incomeVerified === 'true',
              incomeRange: credential.incomeRange,
              employmentStable: credential.employmentStable === 'true',
              confidenceScore: credential.confidenceScore,
              flags: '',
              inferenceId: credential.inferenceId,
              transcriptHash: credential.transcriptHash,
              documentDigest: credential.documentDigest,
            }}
            attestationHash={credential.attestationHash}
            humanVerified={credential.humanVerified === 'true'}
            rotatingPaymentAddr={credential.rotatingPaymentAddr || undefined}
            issuedAt={Number.parseInt(credential.issuedAt, 10)}
            expiresAt={expiresAt}
          />

          <p className="text-xs text-zinc-400">
            Credential commitment: {credential.credentialCommitment.slice(0, 18)}… · World ID nullifier
            bound · Chainlink Attester digests on ENS
          </p>
          <p className="text-xs text-zinc-500">
            Screening only. Legal identity is disclosed separately at lease signing.
          </p>
        </div>
      ) : null}
    </>
  )
}
