import { createPublicClient, http, keccak256, toBytes, zeroAddress, type Address } from 'viem'
import { mainnet, sepolia } from 'viem/chains'
import { addEnsContracts } from '@ensdomains/ensjs'
import { getName, getOwner, getRecords, getResolver } from '@ensdomains/ensjs/public'
import { getNamesForAddress } from '@ensdomains/ensjs/subgraph'
import { normalize } from 'viem/ens'

import { getRegistryParent, getRegistrySubname } from './registry'
import {
  CREDENTIAL_TEXT_KEYS,
  getAccessSubname,
  getParentDomain,
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

function ownerAddresses(owner: Awaited<ReturnType<typeof getOwner>>): Address[] {
  if (!owner) return []
  return [owner.owner, owner.registrant].filter(
    (entry): entry is Address => Boolean(entry && entry !== zeroAddress),
  )
}

function ensChainLabel(chainId: number): string {
  if (chainId === sepolia.id) return 'Sepolia'
  if (chainId === mainnet.id) return 'mainnet'
  return `chain ${chainId}`
}

function shortAddress(address: Address): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

function isSecondLevelEnsName(ensName: string): boolean {
  const normalized = ensName.trim().toLowerCase()
  const labels = normalized.split('.')
  return labels.length === 2 && normalized.endsWith('.eth')
}

function ensRegistrationUrl(chainId: number): string {
  return chainId === sepolia.id ? 'https://sepolia.app.ens.domains' : 'https://app.ens.domains'
}

async function readEnsOwnerOnChain(ensName: string, chainId: number): Promise<Address | null> {
  const client = createPublicClient({
    chain: chainId === mainnet.id ? addEnsContracts(mainnet) : addEnsContracts(sepolia),
    transport: http(getRpcUrl()),
  })
  const owner = await getOwner(client, { name: normalize(ensName) })
  return ownerAddresses(owner)[0] ?? null
}

export async function addressControlsEnsName(
  address: Address,
  ensName: string,
): Promise<boolean> {
  const client = createEnsPublicClient()
  const owner = await getOwner(client, { name: normalize(ensName) })
  const normalizedAddress = address.toLowerCase()
  return ownerAddresses(owner).some((entry) => entry.toLowerCase() === normalizedAddress)
}

export async function ensNameExists(ensName: string): Promise<boolean> {
  const client = createEnsPublicClient()
  const owner = await getOwner(client, { name: normalize(ensName) })
  return ownerAddresses(owner).length > 0
}

export async function getResolverAddressForName(ensName: string): Promise<Address | null> {
  const client = createEnsPublicClient()
  const resolver = await getResolver(client, { name: normalize(ensName) })
  if (!resolver || resolver === zeroAddress) return null
  return resolver
}

async function pickWritablePublishTarget(
  address: Address,
  candidates: string[],
): Promise<string | null> {
  const unique = dedupeNames(candidates)
  for (const ensName of unique) {
    if (await addressControlsEnsName(address, ensName)) {
      return ensName
    }
  }

  for (const ensName of unique) {
    if (!ensName.startsWith('screening.')) continue
    const parent = ensName.slice('screening.'.length)
    if (!(await addressControlsEnsName(address, parent))) continue
    return ensName
  }

  return null
}

/** Best publish target this wallet can write to on the configured ENS chain. */
export async function resolveWritablePublishTarget(address: Address): Promise<string | null> {
  const client = createEnsPublicClient()
  const candidates: string[] = []

  try {
    const ownedNames = await getNamesForAddress(client, { address })
    for (const entry of ownedNames) {
      if (!entry.name?.endsWith('.eth')) continue
      candidates.push(getAccessSubname(entry.name))
      candidates.push(entry.name)
    }
  } catch {
    // Subgraph may rate-limit.
  }

  try {
    const reverse = await getName(client, { address })
    if (reverse?.name) {
      candidates.push(getAccessSubname(reverse.name))
      candidates.push(reverse.name)
    }
  } catch {
    // Reverse record may be unset.
  }

  const registrySubname = getRegistrySubname(address)
  if (registrySubname) candidates.push(registrySubname)

  const parent = getRegistryParent()
  if (parent) {
    candidates.push(getAccessSubname(parent))
    candidates.push(parent)
  }

  return pickWritablePublishTarget(address, candidates)
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
    issuer: values[18] || '40x',
    version: values[19] || '1',
    tenantAddress: values[20] || '',
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

export interface DiscoveredCredential {
  ensName: string
  credential: CredentialRecord
  issuedAt: number
}

function dedupeNames(names: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const name of names) {
    const normalized = name.trim().toLowerCase()
    if (!normalized.endsWith('.eth') || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
  }
  return result
}

async function candidateCredentialNames(address: Address): Promise<string[]> {
  const client = createEnsPublicClient()
  const candidates: string[] = []

  const registryName = getRegistrySubname(address)
  if (registryName) candidates.push(registryName)

  const parent = getRegistryParent()
  if (parent && parent.split('.').length === 2) {
    candidates.push(parent)
    candidates.push(`screening.${parent}`)
  }

  try {
    const ownedNames = await getNamesForAddress(client, { address })
    for (const entry of ownedNames) {
      if (!entry.name) continue
      candidates.push(entry.name)
      candidates.push(getAccessSubname(entry.name))
    }
  } catch {
    // Subgraph may rate-limit; continue with other strategies.
  }

  try {
    const reverse = await getName(client, { address })
    if (reverse?.name) {
      candidates.push(reverse.name)
      candidates.push(getAccessSubname(reverse.name))
    }
  } catch {
    // Reverse record may be unset.
  }

  return dedupeNames(candidates)
}

function credentialIssuedAt(credential: CredentialRecord): number {
  const parsed = Number.parseInt(credential.issuedAt, 10)
  return Number.isFinite(parsed) ? parsed : 0
}

function credentialMatchesAddress(credential: CredentialRecord, address: Address): boolean {
  if (credential.tenantAddress) {
    return credential.tenantAddress.toLowerCase() === address.toLowerCase()
  }
  return true
}

export async function discoverCredentialForAddress(
  address: Address,
): Promise<DiscoveredCredential | null> {
  const names = await candidateCredentialNames(address)
  let best: DiscoveredCredential | null = null

  for (const ensName of names) {
    const credential = await readCredential(ensName)
    if (!credential || credential.verified !== 'true') continue
    if (!credentialMatchesAddress(credential, address)) continue

    const issuedAt = credentialIssuedAt(credential)
    if (!best || issuedAt >= best.issuedAt) {
      best = { ensName, credential, issuedAt }
    }
  }

  return best
}

export async function canPublishToEnsName(
  address: Address,
  ensName: string,
): Promise<boolean> {
  if (await addressControlsEnsName(address, ensName)) return true

  const parent = getParentDomain(ensName)
  const normalizedName = ensName.trim().toLowerCase()
  if (parent && parent !== normalizedName && (await addressControlsEnsName(address, parent))) {
    return true
  }

  return false
}

/** Human-readable reason publishing is blocked for this wallet + ENS name on the configured chain. */
export async function explainEnsPublishBlocker(
  address: Address,
  ensName: string,
): Promise<string> {
  const chainId = getEnsChainId()
  const chainLabel = ensChainLabel(chainId)
  const normalizedName = ensName.trim().toLowerCase()
  const registerUrl = ensRegistrationUrl(chainId)

  if (await addressControlsEnsName(address, ensName)) {
    return ''
  }

  const parent = getParentDomain(ensName)
  const isSubname = Boolean(parent && parent !== normalizedName)
  if (isSubname && parent && (await addressControlsEnsName(address, parent))) {
    return ''
  }

  const existsOnConfiguredChain = await ensNameExists(ensName)

  if (!existsOnConfiguredChain && isSecondLevelEnsName(ensName)) {
    if (chainId !== mainnet.id) {
      const mainnetOwner = await readEnsOwnerOnChain(ensName, mainnet.id)
      if (mainnetOwner) {
        return (
          `${ensName} exists on Ethereum mainnet (owner ${shortAddress(mainnetOwner)}) but is not registered on ${chainLabel}. ` +
          `This app publishes on ${chainLabel}. Register ${ensName} on ${chainLabel} at ${registerUrl} ` +
          `with wallet ${shortAddress(address)}, then retry.`
        )
      }
    }

    return (
      `${ensName} is not registered on ${chainLabel} ENS. Register it at ${registerUrl} ` +
      `(wallet ${shortAddress(address)} on ${chainLabel}, public resolver), then publish again.`
    )
  }

  if (!existsOnConfiguredChain && isSubname && parent) {
    if (!(await ensNameExists(parent))) {
      return `${ensName} cannot be created because ${parent} is not registered on ${chainLabel}.`
    }
    return `Your wallet does not own ${parent} on ${chainLabel}, so it cannot create ${ensName}.`
  }

  const owner = await readEnsOwnerOnChain(ensName, chainId)
  if (owner) {
    return (
      `${ensName} on ${chainLabel} is owned by ${shortAddress(owner)}. ` +
      `You connected ${shortAddress(address)}. Switch to the owner wallet on ${chainLabel}.`
    )
  }

  return `Cannot publish to ${ensName} on ${chainLabel}. Connect a wallet that controls this name on ${chainLabel}.`
}

export async function resolvePublishTarget(address: Address): Promise<string | null> {
  const client = createEnsPublicClient()

  // Prefer the wallet's ENS name directly for credential text records.
  try {
    const ownedNames = await getNamesForAddress(client, { address })
    const first = ownedNames.find((entry) => entry.name?.endsWith('.eth'))
    if (first?.name) return getAccessSubname(first.name)
  } catch {
    // Subgraph may rate-limit; continue with other strategies.
  }

  try {
    const reverse = await getName(client, { address })
    if (reverse?.name) return getAccessSubname(reverse.name)
  } catch {
    // Reverse record may be unset.
  }

  const parent = getRegistryParent()
  if (parent) {
    // 2LD registry (e.g. jessie.eth) → credentials on the parent name directly.
    if (parent.split('.').length === 2) {
      return parent
    }
    // 3LD+ registry (e.g. rentals.zkcred.eth) → per-wallet subname.
    return getRegistrySubname(address)
  }

  return null
}

export async function isAddressCredentialController(
  address: Address,
  ensName: string,
): Promise<boolean> {
  const credential = await readCredential(ensName)
  if (credential?.tenantAddress) {
    return credential.tenantAddress.toLowerCase() === address.toLowerCase()
  }

  const client = createEnsPublicClient()
  const owner = await getOwner(client, { name: normalize(ensName) })
  if (!owner) return false

  const owners = [owner.owner, owner.registrant].filter(Boolean) as Address[]
  return owners.some((entry) => entry.toLowerCase() === address.toLowerCase())
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
  tenantAddress: string,
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
    { key: 'zkcred.v1.issuer', value: '40x' },
    { key: 'zkcred.v1.version', value: '1' },
    { key: 'zkcred.v1.tenantAddress', value: tenantAddress.toLowerCase() },
  ] as const
}

export function getEnsChainId() {
  return ENS_CHAIN_ID
}

export { getAccessSubname }
