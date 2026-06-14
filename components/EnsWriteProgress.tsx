'use client'

import { useState } from 'react'
import { addEnsContracts } from '@ensdomains/ensjs'
import { createSubname, setTextRecord } from '@ensdomains/ensjs/wallet'
import { createWalletClient, custom, type Address } from 'viem'
import { mainnet, sepolia } from 'viem/chains'
import { waitForTransactionReceipt } from 'viem/actions'
import { useAccount, usePublicClient } from 'wagmi'

import {
  addressControlsEnsName,
  buildCredentialRecords,
  ensNameExists,
  ENS_PUBLIC_RESOLVER,
  getEnsChainId,
  getResolverAddressForName,
} from '@/lib/ens'
import { getParentDomain } from '@/lib/types'
import type { DocumentAttestation } from '@/lib/types'

interface EnsWriteProgressProps {
  accessSubname: string
  attestation: DocumentAttestation
  attestationHash: string
  worldIdNullifier: string
  worldIdVerificationSeal?: string
  tenantAddress: string
  onComplete: () => void
  onError: (message: string) => void
}

function getEnsChain() {
  return getEnsChainId() === mainnet.id ? addEnsContracts(mainnet) : addEnsContracts(sepolia)
}

function formatEnsWriteError(ensName: string, parent: string | null, chainId: number): string {
  const chainHint =
    chainId === sepolia.id
      ? 'jessie.eth lives on Ethereum mainnet — set NEXT_PUBLIC_ENS_CHAIN_ID=1 and switch your wallet to mainnet.'
      : `Ensure your wallet controls ${ensName} or its parent ${parent ?? 'ENS name'} on chain ${chainId}.`

  return `Cannot publish to ${ensName}. ${chainHint}`
}

export function EnsWriteProgress({
  accessSubname,
  attestation,
  attestationHash,
  worldIdNullifier,
  worldIdVerificationSeal,
  tenantAddress,
  onComplete,
  onError,
}: EnsWriteProgressProps) {
  const { address, connector } = useAccount()
  const publicClient = usePublicClient({ chainId: getEnsChainId() })
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
    tenantAddress,
  )

  async function sendEnsTransaction(
    ensWallet: ReturnType<typeof createWalletClient>,
    owner: Address,
    request: { to: Address; data: `0x${string}` },
  ) {
    return ensWallet.sendTransaction({
      account: owner,
      chain: getEnsChain(),
      to: request.to,
      data: request.data,
    })
  }

  async function ensureWritableTarget(
    ensWallet: ReturnType<typeof createWalletClient>,
    ensName: string,
    owner: Address,
  ) {
    if (await ensNameExists(ensName)) {
      if (await addressControlsEnsName(owner, ensName)) return ensName
      throw new Error(
        formatEnsWriteError(ensName, getParentDomain(ensName), getEnsChainId()),
      )
    }

    const parent = getParentDomain(ensName)
    if (!parent) {
      throw new Error(
        `ENS name ${ensName} is not valid on chain ${getEnsChainId()}. Connect a wallet that controls an ENS name.`,
      )
    }

    if (!(await addressControlsEnsName(owner, parent))) {
      throw new Error(
        formatEnsWriteError(ensName, parent, getEnsChainId()),
      )
    }

    const subnameTx = createSubname.makeFunctionData(
      ensWallet as never,
      {
        name: ensName,
        owner,
        contract: 'registry',
        resolverAddress: ENS_PUBLIC_RESOLVER,
      },
    )

    const hash = await sendEnsTransaction(ensWallet, owner, subnameTx)
    await waitForTransactionReceipt(publicClient!, { hash })
    return ensName
  }

  async function writeAllRecords() {
    if (!address || !publicClient) {
      onError('Connect your wallet before writing ENS records')
      return
    }

    const provider = await connector?.getProvider()
    if (!provider) {
      onError('Wallet provider unavailable')
      return
    }

    const ensWallet = createWalletClient({
      account: address,
      chain: getEnsChain(),
      transport: custom(provider as Parameters<typeof custom>[0]),
    })

    setWriting(true)

    try {
      const writableName = await ensureWritableTarget(ensWallet, accessSubname, address)
      const resolverAddress =
        (await getResolverAddressForName(writableName)) ?? ENS_PUBLIC_RESOLVER

      for (let index = currentIndex; index < records.length; index += 1) {
        const record = records[index]
        const textTx = setTextRecord.makeFunctionData(
          ensWallet as never,
          {
            name: writableName,
            key: record.key,
            value: record.value,
            resolverAddress,
          },
        )

        const hash = await sendEnsTransaction(ensWallet, address, textTx)
        await waitForTransactionReceipt(publicClient, { hash })
        setCurrentIndex(index + 1)
      }

      setDone(true)
      await fetch('/api/credential/complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          worldIdNullifier,
          verificationSeal: worldIdVerificationSeal,
          tenantAddress,
        }),
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
      <h2 className="mb-2 text-xl font-semibold">Publish credential to ENS</h2>
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
