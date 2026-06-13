'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useAccount } from 'wagmi'
import { namehash } from 'viem/ens'
import { waitForTransactionReceipt } from 'viem/actions'
import { usePublicClient, useWriteContract } from 'wagmi'

import { ConnectWallet } from '@/components/ConnectWallet'
import { CredentialCard } from '@/components/CredentialCard'
import {
  DocumentUpload,
  filesToBase64,
  type DocumentFiles,
} from '@/components/DocumentUpload'
import { EnsWriteProgress } from '@/components/EnsWriteProgress'
import { WorldIDVerify } from '@/components/WorldIDVerify'
import { ENS_PUBLIC_RESOLVER, ENS_PUBLIC_RESOLVER_ABI } from '@/lib/ens'
import type { DocumentAttestation } from '@/lib/types'
import { getAccessSubname } from '@/lib/types'

type Step = 'connect' | 'worldid' | 'upload' | 'processing' | 'ens-write' | 'share' | 'done'

export default function TenantPage() {
  const { isConnected, address } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()

  const [step, setStep] = useState<Step>('connect')
  const [ensName, setEnsName] = useState('')
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
  const [shareUrl, setShareUrl] = useState('')
  const [rotatingPaymentAddr, setRotatingPaymentAddr] = useState('')
  const [sharing, setSharing] = useState(false)
  const [error, setError] = useState('')

  const subname = ensName ? getAccessSubname(ensName) : ''

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
    if (!ensName.endsWith('.eth')) {
      setError('Please enter a valid ENS name (e.g. alice.eth)')
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
          ensName,
          tenantAddress: address,
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error ?? 'Verification failed')
      }

      setAccessSubname(data.accessSubname ?? getAccessSubname(ensName))
      setInferenceId(data.inferenceId ?? '')

      if (data.mode === 'fixture' || data.status === 'completed') {
        setAttestation(data.attestation)
        setAttestationHash(data.attestationHash)
        setStep('ens-write')
        return
      }

      const completed = await pollInferenceStatus(data.inferenceId, ensName)
      setAttestation(completed.attestation)
      setAttestationHash(completed.attestationHash)
      setAccessSubname(completed.accessSubname)
      setStep('ens-write')
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : 'Failed to generate credential')
      setStep('upload')
    }
  }

  async function handleShareWithLandlord() {
    if (!accessSubname) return
    setSharing(true)
    setError('')

    try {
      const response = await fetch('/api/credential/share', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ensName }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error ?? 'Failed to generate share link')
      }

      setShareUrl(data.shareUrl)
      setRotatingPaymentAddr(data.rotatingPaymentAddr)

      if (publicClient) {
        const hash = await writeContractAsync({
          address: ENS_PUBLIC_RESOLVER,
          abi: ENS_PUBLIC_RESOLVER_ABI,
          functionName: 'setText',
          args: [namehash(accessSubname), 'zkcred.v1.rotatingPaymentAddr', data.rotatingPaymentAddr],
        })
        await waitForTransactionReceipt(publicClient, { hash })
      }

      setStep('done')
    } catch (shareError) {
      setError(shareError instanceof Error ? shareError.message : 'Failed to share credential')
    } finally {
      setSharing(false)
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
        PDFs are analyzed by the Chainlink Confidential AI Attester inside a TEE. Landlords receive
        only screening conclusions on <strong>{subname || 'screening.yourname.eth'}</strong> — never raw documents.
      </div>

      {error ? (
        <div className="mb-6 rounded border border-red-200 bg-red-50 p-3 text-red-700">{error}</div>
      ) : null}

      {step === 'connect' ? (
        <section className="rounded-lg border p-6">
          <h2 className="mb-4 text-xl font-semibold">Step 1: Connect your wallet</h2>
          <p className="mb-4 text-zinc-600">
            Your credential publishes to a screening subname. Primary ENS identity stays private.
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
              <p className="text-xs text-zinc-500">
                Credential subname: {ensName ? getAccessSubname(ensName) : 'screening.your-name.eth'}
              </p>
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
          <h2 className="mb-4 text-xl font-semibold">Step 2: Prove you&apos;re a unique person</h2>
          <p className="mb-6 text-zinc-600">
            World ID prevents duplicate tenant profiles. Does not reveal your legal name.
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

      {step === 'ens-write' && attestation ? (
        <EnsWriteProgress
          accessSubname={accessSubname || getAccessSubname(ensName)}
          attestation={attestation}
          attestationHash={attestationHash}
          worldIdNullifier={worldIdNullifier ?? ''}
          onComplete={() => setStep('share')}
          onError={setError}
        />
      ) : null}

      {step === 'share' && attestation ? (
        <section className="rounded-lg border p-6">
          <h2 className="mb-2 text-xl font-semibold">Share with landlord</h2>
          <p className="mb-4 text-sm text-zinc-600">
            Generate a capability link for <strong>{accessSubname}</strong> and rotate a fresh payment alias.
          </p>
          <button
            type="button"
            onClick={() => void handleShareWithLandlord()}
            disabled={sharing}
            className="rounded bg-black px-6 py-2 text-white disabled:opacity-50"
          >
            {sharing ? 'Rotating payment alias…' : 'Generate landlord access link'}
          </button>
        </section>
      ) : null}

      {step === 'done' && attestation ? (
        <CredentialCard
          ensName={accessSubname || getAccessSubname(ensName)}
          attestation={attestation}
          attestationHash={attestationHash}
          shareUrl={shareUrl}
          rotatingPaymentAddr={rotatingPaymentAddr}
          humanVerified
        />
      ) : null}
    </main>
  )
}
