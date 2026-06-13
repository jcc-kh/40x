'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useAccount } from 'wagmi'

import { ConnectWallet } from '@/components/ConnectWallet'
import { CredentialCard } from '@/components/CredentialCard'
import { DocumentUpload, type DocumentType } from '@/components/DocumentUpload'
import { EnsWriteProgress } from '@/components/EnsWriteProgress'
import { WorldIDVerify } from '@/components/WorldIDVerify'
import type { AttestationResult } from '@/lib/types'

type Step = 'connect' | 'worldid' | 'upload' | 'processing' | 'ens-write' | 'done'

export default function TenantPage() {
  const { isConnected } = useAccount()
  const [step, setStep] = useState<Step>('connect')
  const [ensName, setEnsName] = useState('')
  const [worldIdNullifier, setWorldIdNullifier] = useState<string | null>(null)
  const [documents, setDocuments] = useState<Record<DocumentType, string>>({
    passport: '',
    bank: '',
    payroll: '',
  })
  const [attestation, setAttestation] = useState<AttestationResult | null>(null)
  const [attestationHash, setAttestationHash] = useState('')
  const [error, setError] = useState('')

  async function handleGenerateCredential() {
    if (!documents.passport && !documents.bank && !documents.payroll) {
      setError('Please upload at least one document')
      return
    }
    if (!worldIdNullifier) {
      setError('World ID verification required')
      return
    }
    if (!ensName.endsWith('.eth')) {
      setError('Please enter a valid ENS name (e.g. alice.eth)')
      return
    }

    setStep('processing')
    setError('')

    try {
      const response = await fetch('/api/chainlink', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          documentTexts: documents,
          thresholdUSD: 5000,
          worldIdNullifier,
          ensName,
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error ?? 'Verification failed')
      }

      setAttestation(data.attestation)
      setAttestationHash(data.attestationHash)
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
          <p className="text-zinc-600">Generate a privacy-preserving income credential</p>
        </div>
        <Link href="/verify" className="text-sm underline">
          Landlord verify
        </Link>
      </div>

      <div className="mb-6 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        Simulation mode: documents are analyzed via local CRE workflow simulate. Raw document text is
        never stored.
      </div>

      {error ? (
        <div className="mb-6 rounded border border-red-200 bg-red-50 p-3 text-red-700">{error}</div>
      ) : null}

      {step === 'connect' ? (
        <section className="rounded-lg border p-6">
          <h2 className="mb-4 text-xl font-semibold">Step 1: Connect your wallet</h2>
          <p className="mb-4 text-zinc-600">
            Your credential will be stored on your ENS name. You must own the name to write records.
          </p>
          <ConnectWallet />
          {isConnected ? (
            <div className="mt-4 space-y-4">
              <input
                type="text"
                placeholder="your-name.eth"
                value={ensName}
                onChange={(event) => setEnsName(event.target.value.trim())}
                className="w-full rounded border p-2"
              />
              <button
                type="button"
                onClick={() => setStep('worldid')}
                disabled={!ensName.endsWith('.eth')}
                className="rounded bg-black px-6 py-2 text-white disabled:opacity-50"
              >
                Continue
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {step === 'worldid' ? (
        <section className="rounded-lg border p-6">
          <h2 className="mb-4 text-xl font-semibold">Step 2: Verify you&apos;re human</h2>
          <p className="mb-6 text-zinc-600">
            World ID ensures one credential per real person for {ensName}.
          </p>
          <WorldIDVerify
            ensName={ensName}
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
            PDF text is extracted in your browser and analyzed inside a Chainlink TEE simulation.
          </p>
          <DocumentUpload
            documents={documents}
            onDocumentText={(type, text) => setDocuments((prev) => ({ ...prev, [type]: text }))}
            onError={setError}
          />
          <button
            type="button"
            onClick={() => void handleGenerateCredential()}
            className="mt-4 w-full rounded bg-black px-6 py-2 text-white"
          >
            Generate Credential
          </button>
        </section>
      ) : null}

      {step === 'processing' ? (
        <section className="rounded-lg border p-6 text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-black border-t-transparent" />
          <p className="font-medium">AI analyzing documents inside Chainlink TEE simulation...</p>
          <p className="mt-2 text-sm text-zinc-500">This may take 15-60 seconds</p>
        </section>
      ) : null}

      {step === 'ens-write' && attestation ? (
        <EnsWriteProgress
          ensName={ensName}
          attestation={attestation}
          attestationHash={attestationHash}
          worldIdNullifier={worldIdNullifier ?? ''}
          onComplete={() => setStep('done')}
          onError={setError}
        />
      ) : null}

      {step === 'done' && attestation ? (
        <CredentialCard
          ensName={ensName}
          attestation={attestation}
          attestationHash={attestationHash}
        />
      ) : null}
    </main>
  )
}
