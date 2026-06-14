'use client'

import { useCallback, useEffect, useState } from 'react'

import { CredentialCard } from '@/components/CredentialCard'
import type { CredentialRecord } from '@/lib/types'

export function VerifyForm() {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [presentUrl, setPresentUrl] = useState('')
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [credential, setCredential] = useState<CredentialRecord | null>(null)
  const [resolvedName, setResolvedName] = useState('')
  const [tenantAddress, setTenantAddress] = useState('')
  const [status, setStatus] = useState<'idle' | 'pending' | 'verified' | 'expired'>('idle')
  const [error, setError] = useState('')

  const pollSession = useCallback(async (id: string) => {
    const response = await fetch(`/api/session/${id}`)
    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error ?? 'Failed to load session')
    }

    setStatus(data.status)

    if (data.status === 'verified' && data.credential) {
      setResolvedName(data.ensName)
      setTenantAddress(data.tenantAddress ?? '')
      setCredential(data.credential)
    }
  }, [])

  useEffect(() => {
    if (!sessionId || status === 'verified' || status === 'expired') return

    const interval = setInterval(() => {
      void pollSession(sessionId).catch((pollError) => {
        setError(pollError instanceof Error ? pollError.message : 'Failed to poll session')
      })
    }, 3000)

    void pollSession(sessionId)

    return () => clearInterval(interval)
  }, [sessionId, status, pollSession])

  async function handleCreateSession() {
    setCreating(true)
    setError('')
    setCredential(null)
    setResolvedName('')
    setTenantAddress('')
    setCopied(false)

    try {
      const response = await fetch('/api/session/create', { method: 'POST' })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error ?? 'Failed to create session')
      }

      setSessionId(data.sessionId)
      setPresentUrl(data.presentUrl)
      setStatus('pending')
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Failed to create session')
    } finally {
      setCreating(false)
    }
  }

  async function handleCopyLink() {
    if (!presentUrl) return

    try {
      await navigator.clipboard.writeText(presentUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Could not copy — select the link and copy manually.')
    }
  }

  const expiresAt = credential ? Number.parseInt(credential.expiresAt, 10) : 0
  const isExpired = credential ? expiresAt < Math.floor(Date.now() / 1000) : false

  return (
    <>
      <div className="mb-6 rounded border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        Start a verification session and share the link with your applicant. They connect their
        wallet and sign — proving they control the credential. World ID uniqueness is checked once
        at credential creation.
      </div>

      {!sessionId || status === 'verified' ? (
        <button
          type="button"
          onClick={() => void handleCreateSession()}
          disabled={creating}
          className="rounded bg-black px-6 py-3 text-white disabled:opacity-50"
        >
          {creating
            ? 'Creating session…'
            : status === 'verified'
              ? 'Verify another applicant'
              : 'Start verification session'}
        </button>
      ) : null}

      {sessionId && status === 'pending' ? (
        <div className="mt-6 space-y-4 rounded-lg border border-zinc-200 p-6">
          <h2 className="text-lg font-semibold text-zinc-900">Waiting for tenant presentation</h2>
          <p className="text-sm text-zinc-600">
            Share this link with the applicant (QR, SMS, or in person):
          </p>
          <a
            href={presentUrl}
            target="_blank"
            rel="noreferrer"
            className="block break-all rounded bg-zinc-100 p-3 font-mono text-sm text-blue-700 underline"
          >
            {presentUrl}
          </a>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void handleCopyLink()}
              className="rounded border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
            >
              {copied ? 'Copied!' : 'Copy link'}
            </button>
            <button
              type="button"
              onClick={() => void handleCreateSession()}
              disabled={creating}
              className="rounded border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
            >
              {creating ? 'Creating…' : 'New session'}
            </button>
          </div>
          <p className="text-sm text-zinc-500">Polling for live proof…</p>
        </div>
      ) : null}

      {error ? (
        <div className="mt-6 rounded border border-red-200 bg-red-50 p-3 text-red-700">{error}</div>
      ) : null}

      {credential ? (
        <div className="mt-6 space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-4xl">
              {credential.verified === 'true' && !isExpired ? '✅' : '⚠️'}
            </span>
            <div>
              <h2 className="text-xl font-semibold text-zinc-900">{resolvedName}</h2>
              <p className="text-sm text-zinc-500">
                {isExpired ? 'Credential expired' : 'Live presentation verified'}
              </p>
              {tenantAddress ? (
                <p className="text-xs text-zinc-400">Holder wallet: {tenantAddress}</p>
              ) : null}
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
            SIWE wallet proof · ENS credential from wallet · World ID at issuance
          </p>
        </div>
      ) : null}
    </>
  )
}
