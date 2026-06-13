'use client'

import { useState } from 'react'
import { namehash } from 'viem/ens'
import { waitForTransactionReceipt } from 'viem/actions'
import { useAccount, usePublicClient, useWriteContract } from 'wagmi'

import {
  buildCredentialRecords,
  ENS_PUBLIC_RESOLVER,
  ENS_PUBLIC_RESOLVER_ABI,
} from '@/lib/ens'
import type { DocumentAttestation } from '@/lib/types'

interface EnsWriteProgressProps {
  accessSubname: string
  attestation: DocumentAttestation
  attestationHash: string
  worldIdNullifier: string
  onComplete: () => void
  onError: (message: string) => void
}

export function EnsWriteProgress({
  accessSubname,
  attestation,
  attestationHash,
  worldIdNullifier,
  onComplete,
  onError,
}: EnsWriteProgressProps) {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()
  const [currentIndex, setCurrentIndex] = useState(0)
  const [writing, setWriting] = useState(false)
  const [done, setDone] = useState(false)

  const issuedAt = Math.floor(Date.now() / 1000)
  const expiresAt = issuedAt + 60 * 60 * 24 * 90
  const records = buildCredentialRecords(
    attestation,
    attestationHash,
    worldIdNullifier,
    accessSubname,
    '',
    issuedAt,
    expiresAt,
  )

  async function writeAllRecords() {
    if (!address || !publicClient) {
      onError('Connect your wallet before writing ENS records')
      return
    }

    setWriting(true)

    try {
      const node = namehash(accessSubname)

      for (let index = currentIndex; index < records.length; index += 1) {
        const record = records[index]
        const hash = await writeContractAsync({
          address: ENS_PUBLIC_RESOLVER,
          abi: ENS_PUBLIC_RESOLVER_ABI,
          functionName: 'setText',
          args: [node, record.key, record.value],
        })

        await waitForTransactionReceipt(publicClient, { hash })
        setCurrentIndex(index + 1)
      }

      setDone(true)
      await fetch('/api/credential/complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ worldIdNullifier }),
      })
      onComplete()
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Failed to write ENS records')
    } finally {
      setWriting(false)
    }
  }

  return (
    <div className="rounded-lg border p-6">
      <h2 className="mb-2 text-xl font-semibold">Publish credential to ENS subname</h2>
      <p className="mb-4 text-sm text-zinc-600">
        Sign {records.length} transactions to store your screening credential on{' '}
        <strong>{accessSubname}</strong>. Includes Chainlink Attester digests and proof anchors —
        never raw document text.
      </p>

      <div className="mb-4 h-2 overflow-hidden rounded bg-zinc-100">
        <div
          className="h-full bg-black transition-all"
          style={{ width: `${(currentIndex / records.length) * 100}%` }}
        />
      </div>

      <p className="mb-4 text-sm text-zinc-500">
        {done
          ? 'All ENS records written.'
          : writing
            ? `Writing record ${currentIndex + 1} of ${records.length}...`
            : `${currentIndex} of ${records.length} records written`}
      </p>

      {!done ? (
        <button
          type="button"
          onClick={() => void writeAllRecords()}
          disabled={writing}
          className="rounded bg-black px-6 py-2 text-white disabled:opacity-50"
        >
          {writing ? 'Confirm in wallet...' : currentIndex === 0 ? 'Start ENS writes' : 'Continue ENS writes'}
        </button>
      ) : null}
    </div>
  )
}
