'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useAccount } from 'wagmi'

import { ConnectWallet } from '@/components/ConnectWallet'
import { CredentialCard } from '@/components/CredentialCard'
import {
  DocumentUpload,
  filesToBase64,
  type DocumentFiles,
} from '@/components/DocumentUpload'
import { EnsWriteProgress } from '@/components/EnsWriteProgress'
import { WorldIDVerify } from '@/components/WorldIDVerify'
import type { DocumentAttestation } from '@/lib/types'

type Step = 'connect' | 'worldid' | 'upload' | 'processing' | 'ens-write' | 'done'

export default function TenantPage() {
  const { isConnected, address } = useAccount()

  const [step, setStep] = useState<Step>('connect')
  const [publishTarget, setPublishTarget] = useState<string | null>(null)
  const [worldIdNullifier, setWorldIdNullifier] = useState<string | null>(null)
  const [documents, setDocuments] = useState<DocumentFiles>({
    passport: null,
    bank: null,
    payroll: null,
  })
  const [attestation, setAttestation] = useState<DocumentAttestation | null>(null)
  const [attestationHash, setAttestationHash] = useState('')
  const [accessSubname, setAccessSubname] = useState('')
  const [inferenceId, setInferenceId] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!address) {
      setPublishTarget(null)
      return
    }

    async function loadPublishTarget() {
      const response = await fetch(`/api/credential/discover?address=${address}`)
      const data = await response.json()
      if (!response.ok) {
        setError(data.error ?? 'Failed to resolve ENS publish target')
        return
      }

      if (!data.publishTarget) {
        setError(
          'No ENS publish target found. Set NEXT_PUBLIC_REGISTRY_PARENT or connect a wallet that owns an ENS name.',
        )
        return
      }

      setPublishTarget(data.publishTarget)
      setAccessSubname(data.publishTarget)
      setError('')
    }

    void loadPublishTarget()
  }, [address])

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

    throw new Error('Inference timed out. Ensure CRE callback (ngrok) is running.')
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

  return (
    <main className="mx-auto max-w-2xl p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">zkCredentials</h1>
          <p className="text-zinc-600">Privacy-preserving tenant screening on ENS</p>
        </div>
        <Link href="/verify" className="text-sm underline">
          Landlord verify
        </Link>
      </div>

      <div className="mb-6 rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
        PDFs are analyzed by the Chainlink Confidential AI Attester inside a TEE. Your wallet
        determines your registry ENS name — landlords verify via live presentation, not shared links.
      </div>

      {error ? (
        <div className="mb-6 rounded border border-red-200 bg-red-50 p-3 text-red-700">{error}</div>
      ) : null}

      {step === 'connect' ? (
        <section className="rounded-lg border p-6">
          <h2 className="mb-4 text-xl font-semibold">Step 1: Connect your wallet</h2>
          <p className="mb-4 text-zinc-600">
            Your credential publishes to a registry subname derived from your wallet, or a screening
            subname under an ENS name you control.
          </p>
          <ConnectWallet />
          {isConnected && publishTarget ? (
            <div className="mt-4 space-y-4">
              <p className="rounded bg-zinc-50 p-3 text-sm">
                Credential location: <strong>{publishTarget}</strong>
              </p>
              <button
                type="button"
                onClick={() => setStep('worldid')}
                className="rounded bg-black px-6 py-2 text-white"
              >
                Continue
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {step === 'worldid' && publishTarget ? (
        <section className="rounded-lg border p-6">
          <h2 className="mb-4 text-xl font-semibold">Step 2: Prove you&apos;re a unique person</h2>
          <p className="mb-6 text-zinc-600">
            World ID prevents duplicate tenant profiles. Does not reveal your legal name.
          </p>
          <WorldIDVerify
            signal={publishTarget}
            onVerified={(nullifier) => {
              setWorldIdNullifier(nullifier)
              setStep('upload')
            }}
            onError={setError}
          />
        </section>
      ) : null}

      {step === 'upload' ? (
        <section className="rounded-lg border p-6">
          <h2 className="mb-4 text-xl font-semibold">Step 3: Upload documents</h2>
          <p className="mb-6 text-zinc-600">
            PDFs sent to Chainlink Attester TEE — never stored on our servers.
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
            Run Confidential Inference
          </button>
        </section>
      ) : null}

      {step === 'processing' ? (
        <section className="rounded-lg border p-6 text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-black border-t-transparent" />
          <p className="font-medium">Confidential inference in progress…</p>
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
          tenantAddress={address}
          onComplete={() => setStep('done')}
          onError={setError}
        />
      ) : null}

      {step === 'done' && attestation ? (
        <div className="space-y-4">
          <CredentialCard
            ensName={accessSubname || publishTarget || ''}
            attestation={attestation}
            attestationHash={attestationHash}
            humanVerified
          />
          <p className="rounded border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            When a landlord starts a verification session, open their presentation link on this
            device to prove you hold this credential.
          </p>
        </div>
      ) : null}
    </main>
  )
}
