import { createPublicClient, http, keccak256, toBytes } from 'viem'
import { mainnet, sepolia } from 'viem/chains'
import { addEnsContracts } from '@ensdomains/ensjs'
import { getRecords } from '@ensdomains/ensjs/public'
import { normalize } from 'viem/ens'

import {
  CREDENTIAL_TEXT_KEYS,
  getAccessSubname,
  type DocumentAttestation,
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

function mapCredentialValues(values: string[]): CredentialRecord {
  return {
    verified: values[0] || 'false',
    humanVerified: values[1] || 'false',
    documentOwnershipVerified: values[2] || 'false',
    documentsConsistent: values[3] || 'false',
    incomeVerified: values[4] || 'false',
    incomeRange: values[5] || 'unknown',
    employmentStable: values[6] || 'false',
    confidenceScore: values[7] || '0',
    inferenceId: values[8] || '',
    transcriptHash: values[9] || '',
    documentDigest: values[10] || '',
    credentialCommitment: values[11] || '',
    accessSubname: values[12] || '',
    rotatingPaymentAddr: values[13] || '',
    attestationHash: values[14] || '',
    worldIdNullifier: values[15] || '',
    issuedAt: values[16] || '',
    expiresAt: values[17] || '',
    issuer: values[18] || 'zkcredentials',
    version: values[19] || '1',
  }
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

    return mapCredentialValues(values)
  } catch {
    return null
  }
}

export function computeCredentialCommitment(
  worldIdNullifier: string,
  attestation: DocumentAttestation,
) {
  return keccak256(
    toBytes(
      JSON.stringify({
        nullifier: worldIdNullifier,
        transcriptHash: attestation.transcriptHash,
        verified: attestation.verified,
        incomeRange: attestation.incomeRange,
        inferenceId: attestation.inferenceId,
      }),
    ),
  )
}

export function computeAttestationHash(
  attestation: DocumentAttestation,
  accessSubname: string,
  timestamp: number,
) {
  return keccak256(
    toBytes(
      JSON.stringify({
        ...attestation,
        accessSubname,
        timestamp,
      }),
    ),
  )
}

export function buildCredentialRecords(
  attestation: DocumentAttestation,
  attestationHash: string,
  worldIdNullifier: string,
  accessSubname: string,
  rotatingPaymentAddr: string,
  issuedAt: number,
  expiresAt: number,
) {
  const humanVerified = worldIdNullifier.length > 0
  const credentialCommitment = computeCredentialCommitment(worldIdNullifier, attestation)

  return [
    { key: 'zkcred.v1.verified', value: String(attestation.verified) },
    { key: 'zkcred.v1.humanVerified', value: String(humanVerified) },
    { key: 'zkcred.v1.documentOwnershipVerified', value: String(attestation.documentOwnershipVerified) },
    { key: 'zkcred.v1.documentsConsistent', value: String(attestation.documentsConsistent) },
    { key: 'zkcred.v1.incomeVerified', value: String(attestation.incomeVerified) },
    { key: 'zkcred.v1.incomeRange', value: attestation.incomeRange },
    { key: 'zkcred.v1.employmentStable', value: String(attestation.employmentStable) },
    { key: 'zkcred.v1.confidenceScore', value: attestation.confidenceScore },
    { key: 'zkcred.v1.inferenceId', value: attestation.inferenceId },
    { key: 'zkcred.v1.transcriptHash', value: attestation.transcriptHash },
    { key: 'zkcred.v1.documentDigest', value: attestation.documentDigest },
    { key: 'zkcred.v1.credentialCommitment', value: credentialCommitment },
    { key: 'zkcred.v1.accessSubname', value: accessSubname },
    { key: 'zkcred.v1.rotatingPaymentAddr', value: rotatingPaymentAddr },
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

export { getAccessSubname }
