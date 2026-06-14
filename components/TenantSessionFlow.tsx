'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAccount, usePublicClient, useSignMessage } from 'wagmi'

import { ConnectWallet } from '@/components/ConnectWallet'
import { CredentialCard } from '@/components/CredentialCard'
import {
  DocumentUpload,
  filesToBase64,
  type DocumentFiles,
} from '@/components/DocumentUpload'
import { EnsWriteProgress } from '@/components/EnsWriteProgress'
import { WorldIDVerify } from '@/components/WorldIDVerify'
import { getEnsChainId } from '@/lib/ens'
import { buildPresentationSiweMessage } from '@/lib/siwe'
import { publishVerifiedSession } from '@/lib/session-client-storage'
import { loadWorldIdVerification } from '@/lib/worldid-client-storage'
import type { DocumentAttestation } from '@/lib/types'

type Step =
  | 'connect'
  | 'worldid'
  | 'upload'
  | 'processing'
  | 'ens-write'
  | 'sign'
  | 'done'

const worldIdSkipEnabled = process.env.NEXT_PUBLIC_SKIP_WORLD_ID_VERIFY === 'true'

async function registerDemoWorldId(
  signal: string,
  walletAddress: string,
): Promise<{ nullifier: string; verificationSeal?: string } | null> {
  const response = await fetch('/api/world-id/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ signal, devBypass: true, address: walletAddress }),
  })
  const data = await response.json()
  if (!response.ok) return null
  return {
    nullifier: data.nullifier ?? null,
    verificationSeal: data.verificationSeal,
  }
}

interface TenantSessionFlowProps {
  /** Landlord session id from ?session= — required for landlord-initiated screening. */
  sessionId: string | null
  /** Signed session envelope from ?seal= — required on Vercel serverless. */
  sessionSeal?: string | null
}

export function TenantSessionFlow({ sessionId, sessionSeal }: TenantSessionFlowProps) {
  const { isConnected, address } = useAccount()
  const publicClient = usePublicClient()
  const { signMessageAsync } = useSignMessage()

  const [step, setStep] = useState<Step>('connect')
  const [sessionNonce, setSessionNonce] = useState('')
  const [publishTarget, setPublishTarget] = useState<string | null>(null)
  const [hasExistingCredential, setHasExistingCredential] = useState(false)
  const [worldIdNullifier, setWorldIdNullifier] = useState<string | null>(null)
  const [worldIdVerificationSeal, setWorldIdVerificationSeal] = useState<string | null>(null)
  const [documents, setDocuments] = useState<DocumentFiles>({
    passport: null,
    bank: null,
    payroll: null,
  })
  const [attestation, setAttestation] = useState<DocumentAttestation | null>(null)
  const [attestationHash, setAttestationHash] = useState('')
  const [accessSubname, setAccessSubname] = useState('')
  const [inferenceId, setInferenceId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const loadSession = useCallback(async () => {
    if (!sessionId) return

    const sealQuery = sessionSeal ? `?seal=${encodeURIComponent(sessionSeal)}` : ''
    const response = await fetch(`/api/session/${sessionId}${sealQuery}`)
    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.hint ?? data.error ?? 'Failed to load session')
    }

    if (data.status === 'verified') {
      setStep('done')
      return
    }

    if (data.status === 'expired') {
      throw new Error('This landlord session has expired — ask for a new link.')
    }

    setSessionNonce(data.nonce ?? '')
  }, [sessionId, sessionSeal])

  useEffect(() => {
    if (!sessionId) return
    void loadSession().catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load session')
    })
  }, [sessionId, loadSession])

  useEffect(() => {
    if (!address) {
      setPublishTarget(null)
      setHasExistingCredential(false)
      return
    }

    async function loadWalletContext() {
      const response = await fetch(`/api/credential/discover?address=${address}`)
      const data = await response.json()
      if (!response.ok) {
        setError(data.error ?? 'Failed to resolve ENS publish target')
        return
      }

      if (!data.publishTarget) {
        setError(
          'No ENS publish target for this wallet. Set NEXT_PUBLIC_REGISTRY_PARENT (e.g. jessie.eth) on the deployment, or connect a wallet with an ENS name.',
        )
        return
      }

      setPublishTarget(data.publishTarget)
      setAccessSubname(data.publishTarget)
      setError('')

      if (data.credential?.verified === 'true' && sessionId) {
        setHasExistingCredential(true)
      }
    }

    void loadWalletContext()
  }, [address, sessionId])

  async function pollInferenceStatus(id: string, name: string) {
    const maxAttempts = 60
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const response = await fetch(
        `/api/attester/status?id=${encodeURIComponent(id)}&ensName=${encodeURIComponent(name)}&thresholdUSD=5000`,
      )
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error ?? 'Failed to poll inference status')
      }

      if (data.status === 'completed' && data.attestation) {
        return data as {
          attestation: DocumentAttestation
          attestationHash: string
          accessSubname: string
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 5000))
    }

    throw new Error('Inference timed out. Ensure Attester callback is reachable.')
  }

  async function handleGenerateCredential() {
    if (!documents.passport || !documents.bank || !documents.payroll) {
      setError('Please upload passport, bank statement, and payroll PDFs')
      return
    }
    if (!worldIdNullifier) {
      setError('World ID verification required')
      return
    }
    if (!address || !publishTarget) {
      setError('Connect wallet and resolve ENS publish target first')
      return
    }

    const cachedVerification = loadWorldIdVerification(address)
    const verificationSeal = worldIdVerificationSeal ?? cachedVerification?.verificationSeal ?? null

    setStep('processing')
    setError('')

    try {
      const documentPdfs = await filesToBase64(documents)
      const response = await fetch('/api/attester/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          documentPdfs,
          thresholdUSD: 5000,
          worldIdNullifier,
          tenantAddress: address,
          verificationSeal,
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error ?? 'Verification failed')
      }

      setAccessSubname(data.accessSubname ?? publishTarget)
      setInferenceId(data.inferenceId ?? '')

      if (data.mode === 'fixture' || data.status === 'completed') {
        setAttestation(data.attestation)
        setAttestationHash(data.attestationHash)
        setStep('ens-write')
        return
      }

      const completed = await pollInferenceStatus(data.inferenceId, publishTarget)
      setAttestation(completed.attestation)
      setAttestationHash(completed.attestationHash)
      setAccessSubname(completed.accessSubname)
      setStep('ens-write')
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : 'Failed to generate credential')
      setStep('upload')
    }
  }

  async function handleSignForLandlord() {
    if (!address || !sessionId || !sessionNonce) return

    setSubmitting(true)
    setError('')

    try {
      const domain = window.location.hostname
      const message = buildPresentationSiweMessage({
        address,
        domain,
        uri: window.location.origin,
        nonce: sessionNonce,
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
          sessionSeal,
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error ?? 'Failed to submit to landlord')
      }

      if (data.credential) {
        setAttestation({
          verified: data.credential.verified === 'true',
          documentOwnershipVerified: data.credential.documentOwnershipVerified === 'true',
          documentsConsistent: data.credential.documentsConsistent === 'true',
          incomeVerified: data.credential.incomeVerified === 'true',
          incomeRange: data.credential.incomeRange,
          employmentStable: data.credential.employmentStable === 'true',
          confidenceScore: data.credential.confidenceScore,
          flags: '',
          inferenceId: data.credential.inferenceId,
          transcriptHash: data.credential.transcriptHash,
          documentDigest: data.credential.documentDigest,
        })
        setAttestationHash(data.credential.attestationHash)
        setAccessSubname(data.ensName ?? accessSubname)
      }

      if (data.sessionSeal && sessionId) {
        publishVerifiedSession(sessionId, data.sessionSeal)
      }

      setStep('done')
    } catch (signError) {
      setError(signError instanceof Error ? signError.message : 'Failed to sign for landlord')
    } finally {
      setSubmitting(false)
    }
  }

  function handleContinueFromConnect() {
    if (hasExistingCredential && sessionId) {
      setStep('sign')
      return
    }

    if (worldIdSkipEnabled && address && publishTarget) {
      setError('')
      void (async () => {
        const result = await registerDemoWorldId(publishTarget, address)
        if (!result?.nullifier) {
          setError('Failed to skip World ID for demo — check server logs')
          setStep('worldid')
          return
        }
        setWorldIdNullifier(result.nullifier)
        setWorldIdVerificationSeal(result.verificationSeal ?? null)
        setStep('upload')
      })()
      return
    }

    setStep('worldid')
  }

  function handleEnsWriteComplete() {
    if (sessionId) {
      setStep('sign')
    } else {
      setStep('done')
    }
  }

  if (!sessionId) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-4 text-red-700">
        Missing session link. Ask your landlord for their screening invitation URL.
      </div>
    )
  }

  if (step === 'done') {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-center">
          <p className="text-2xl">✅</p>
          <h2 className="mt-2 text-xl font-semibold text-zinc-900">Screening submitted</h2>
          <p className="mt-2 text-sm text-zinc-600">
            Your landlord can now see your verified screening results on their device.
          </p>
        </div>
        {attestation ? (
          <CredentialCard
            ensName={accessSubname || publishTarget || ''}
            attestation={attestation}
            attestationHash={attestationHash}
            humanVerified
          />
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="rounded border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        Complete tenant screening for this landlord: verify identity (wallet + World ID), upload
        documents for confidential analysis, then sign to share results.
      </div>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-red-700">{error}</div>
      ) : null}

      {/* Step indicator */}
      <ol className="flex flex-wrap gap-2 text-xs text-zinc-500">
        {(['Connect', 'World ID', 'Upload PDFs', 'Screening', 'Publish', 'Sign'] as const).map(
          (label, index) => {
            const stepOrder: Step[] = ['connect', 'worldid', 'upload', 'processing', 'ens-write', 'sign']
            const currentIndex = stepOrder.indexOf(step === 'processing' ? 'upload' : step)
            const active = index <= currentIndex
            return (
              <li
                key={label}
                className={`rounded px-2 py-1 ${active ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600'}`}
              >
                {label}
              </li>
            )
          },
        )}
      </ol>

      {step === 'connect' ? (
        <section className="rounded-lg border border-zinc-200 p-6">
          <h2 className="mb-4 text-xl font-semibold text-zinc-900">Step 1: Connect wallet</h2>
          <p className="mb-4 text-zinc-600">
            Your wallet anchors your screening credential on ENS.
          </p>
          <ConnectWallet />
          {isConnected && publishTarget ? (
            <div className="mt-4 space-y-4">
              <p className="rounded bg-zinc-100 p-3 text-sm text-zinc-900">
                Credential location: <strong>{publishTarget}</strong>
              </p>
              {hasExistingCredential ? (
                <p className="text-sm text-emerald-700">
                  You already have a screening credential — sign to share it with this landlord.
                </p>
              ) : null}
              <button
                type="button"
                onClick={handleContinueFromConnect}
                className="rounded bg-black px-6 py-2 text-white"
              >
                Continue
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {step === 'worldid' && publishTarget ? (
        <section className="rounded-lg border border-zinc-200 p-6">
          <h2 className="mb-4 text-xl font-semibold text-zinc-900">Step 2: Verify identity (World ID)</h2>
          {worldIdSkipEnabled ? (
            <p className="text-sm text-amber-800">
              Demo mode: World ID is skipped locally. Continuing to document upload…
            </p>
          ) : (
            <>
              <p className="mb-6 text-zinc-600">
                Proves you&apos;re a unique person. One screening credential per human — does not reveal
                your legal name.
              </p>
              <WorldIDVerify
                signal={publishTarget}
                address={address}
                onVerified={(nullifier, meta) => {
                  setError('')
                  setWorldIdNullifier(nullifier)
                  setWorldIdVerificationSeal(meta?.verificationSeal ?? null)
                  if (meta?.alreadyIssuedCredential || hasExistingCredential) {
                    setHasExistingCredential(true)
                    setStep('sign')
                    return
                  }
                  setStep('upload')
                }}
                onError={setError}
              />
              <p className="mt-4 text-xs text-zinc-500">
                If World App says &quot;already verified&quot;, you&apos;ll be sent to document upload
                automatically — no extra click needed.
              </p>
            </>
          )}
        </section>
      ) : null}

      {step === 'upload' ? (
        <section className="rounded-lg border border-zinc-200 p-6">
          <h2 className="mb-4 text-xl font-semibold text-zinc-900">Step 3: Upload screening documents</h2>
          <p className="mb-6 text-zinc-600">
            Passport, bank statement, and payroll PDFs — analyzed by Chainlink Confidential AI
            Attester inside a TEE. Never stored on our servers.
          </p>
          <DocumentUpload
            documents={documents}
            onDocumentFile={(type, file) => setDocuments((prev) => ({ ...prev, [type]: file }))}
            onError={setError}
          />
          <button
            type="button"
            onClick={() => void handleGenerateCredential()}
            className="mt-4 w-full rounded bg-black px-6 py-2 text-white"
          >
            Run confidential screening
          </button>
        </section>
      ) : null}

      {step === 'processing' ? (
        <section className="rounded-lg border border-zinc-200 p-6 text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-black border-t-transparent" />
          <p className="font-medium text-zinc-900">Confidential screening in progress…</p>
          <p className="mt-2 text-sm text-zinc-500">
            {inferenceId ? `Inference ${inferenceId}` : 'Waiting for Chainlink Attester TEE'}
          </p>
        </section>
      ) : null}

      {step === 'ens-write' && attestation && address && (accessSubname || publishTarget) ? (
        <EnsWriteProgress
          accessSubname={accessSubname || publishTarget!}
          attestation={attestation}
          attestationHash={attestationHash}
          worldIdNullifier={worldIdNullifier ?? ''}
          worldIdVerificationSeal={worldIdVerificationSeal ?? ''}
          tenantAddress={address}
          onComplete={handleEnsWriteComplete}
          onError={setError}
        />
      ) : null}

      {step === 'sign' && isConnected && address ? (
        <section className="rounded-lg border border-zinc-200 p-6">
          <h2 className="mb-4 text-xl font-semibold text-zinc-900">
            {hasExistingCredential && !attestation
              ? 'Share credential with landlord'
              : 'Final step: Sign for landlord'}
          </h2>
          <p className="mb-4 text-sm text-zinc-600">
            Sign a message to prove this wallet holds the screening credential and submit results to
            your landlord&apos;s session.
          </p>
          <button
            type="button"
            onClick={() => void handleSignForLandlord()}
            disabled={submitting || !publicClient || !sessionNonce}
            className="rounded bg-black px-6 py-2 text-white disabled:opacity-50"
          >
            {submitting ? 'Submitting…' : 'Sign and submit to landlord'}
          </button>
        </section>
      ) : null}
    </div>
  )
}
