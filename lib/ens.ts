import { createPublicClient, http, keccak256, toBytes } from 'viem'
import { mainnet, sepolia } from 'viem/chains'
import { addEnsContracts } from '@ensdomains/ensjs'
import { getRecords } from '@ensdomains/ensjs/public'
import { normalize } from 'viem/ens'

import {
  CREDENTIAL_TEXT_KEYS,
  type AttestationResult,
  type CredentialRecord,
} from './types'

const ENS_CHAIN_ID = Number(process.env.NEXT_PUBLIC_ENS_CHAIN_ID ?? process.env.ENS_CHAIN_ID ?? '11155111')

export const ENS_PUBLIC_RESOLVER = '0x4976fb03C32e5B8cfe2b6cCB31c09Ba78EBaBa41' as const

export const ENS_PUBLIC_RESOLVER_ABI = [
  {
    inputs: [
      { name: 'node', type: 'bytes32' },
      { name: 'key', type: 'string' },
      { name: 'value', type: 'string' },
    ],
    name: 'setText',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const

function getEnsChain() {
  return ENS_CHAIN_ID === mainnet.id ? addEnsContracts(mainnet) : addEnsContracts(sepolia)
}

function getRpcUrl() {
  return process.env.ALCHEMY_RPC ?? process.env.NEXT_PUBLIC_ALCHEMY_RPC ?? 'https://ethereum.publicnode.com'
}

export function createEnsPublicClient() {
  return createPublicClient({
    chain: getEnsChain(),
    transport: http(getRpcUrl()),
  })
}

export async function readCredential(ensName: string): Promise<CredentialRecord | null> {
  try {
    const client = createEnsPublicClient()
    const normalizedName = normalize(ensName)

    const result = await getRecords(client, {
      name: normalizedName,
      texts: [...CREDENTIAL_TEXT_KEYS],
    })

    const values = CREDENTIAL_TEXT_KEYS.map((key) => {
      const record = result.texts?.find((entry) => entry.key === key)
      return record?.value ?? ''
    })

    if (!values[0]) return null

    return {
      verified: values[0] || 'false',
      incomeVerified: values[1] || 'false',
      identityVerified: values[2] || 'false',
      incomeRange: values[3] || 'unknown',
      employerStable: values[4] || 'false',
      confidenceScore: values[5] || '0',
      attestationHash: values[6] || '',
      worldIdNullifier: values[7] || '',
      issuedAt: values[8] || '',
      expiresAt: values[9] || '',
      issuer: values[10] || 'zkcredentials',
      version: values[11] || '1',
    }
  } catch {
    return null
  }
}

export function computeAttestationHash(
  attestation: AttestationResult,
  ensName: string,
  timestamp: number,
) {
  return keccak256(
    toBytes(
      JSON.stringify({
        ...attestation,
        ensName,
        timestamp,
      }),
    ),
  )
}

export function buildCredentialRecords(
  attestation: AttestationResult,
  attestationHash: string,
  worldIdNullifier: string,
  issuedAt: number,
  expiresAt: number,
) {
  return [
    { key: 'zkcred.v1.verified', value: String(attestation.verified) },
    { key: 'zkcred.v1.incomeVerified', value: String(attestation.incomeVerified) },
    { key: 'zkcred.v1.identityVerified', value: String(attestation.identityVerified) },
    { key: 'zkcred.v1.incomeRange', value: attestation.incomeRange },
    { key: 'zkcred.v1.employerStable', value: String(attestation.employerStable) },
    { key: 'zkcred.v1.confidenceScore', value: attestation.confidenceScore },
    { key: 'zkcred.v1.attestationHash', value: attestationHash },
    { key: 'zkcred.v1.worldId', value: worldIdNullifier },
    { key: 'zkcred.v1.issuedAt', value: String(issuedAt) },
    { key: 'zkcred.v1.expiresAt', value: String(expiresAt) },
    { key: 'zkcred.v1.issuer', value: 'zkcredentials' },
    { key: 'zkcred.v1.version', value: '1' },
  ] as const
}

export function getEnsChainId() {
  return ENS_CHAIN_ID
}
