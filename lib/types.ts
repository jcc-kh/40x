export interface DocumentPdfInput {
  passportBase64: string
  bankBase64: string
  payrollBase64: string
  thresholdUSD: number
  worldIdNullifier: string
  tenantAddress?: string
}

export interface DocumentAttestation {
  verified: boolean
  documentOwnershipVerified: boolean
  documentsConsistent: boolean
  incomeVerified: boolean
  incomeRange: string
  employmentStable: boolean
  confidenceScore: string
  flags: string
  inferenceId: string
  transcriptHash: string
  documentDigest: string
}

export interface PublishedCredential extends DocumentAttestation {
  humanVerified: boolean
  worldIdNullifier: string
  credentialCommitment: string
  accessSubname: string
  rotatingPaymentAddr: string
}

export const CREDENTIAL_TEXT_KEYS = [
  'zkcred.v1.verified',
  'zkcred.v1.humanVerified',
  'zkcred.v1.documentOwnershipVerified',
  'zkcred.v1.documentsConsistent',
  'zkcred.v1.incomeVerified',
  'zkcred.v1.incomeRange',
  'zkcred.v1.employmentStable',
  'zkcred.v1.confidenceScore',
  'zkcred.v1.inferenceId',
  'zkcred.v1.transcriptHash',
  'zkcred.v1.documentDigest',
  'zkcred.v1.credentialCommitment',
  'zkcred.v1.accessSubname',
  'zkcred.v1.rotatingPaymentAddr',
  'zkcred.v1.attestationHash',
  'zkcred.v1.worldId',
  'zkcred.v1.issuedAt',
  'zkcred.v1.expiresAt',
  'zkcred.v1.issuer',
  'zkcred.v1.version',
  'zkcred.v1.tenantAddress',
] as const

export interface CredentialRecord {
  verified: string
  humanVerified: string
  documentOwnershipVerified: string
  documentsConsistent: string
  incomeVerified: string
  incomeRange: string
  employmentStable: string
  confidenceScore: string
  inferenceId: string
  transcriptHash: string
  documentDigest: string
  credentialCommitment: string
  accessSubname: string
  rotatingPaymentAddr: string
  attestationHash: string
  worldIdNullifier: string
  issuedAt: string
  expiresAt: string
  issuer: string
  version: string
  tenantAddress: string
}

export const WORLD_ID_ACTION = 'verify-credential'
export const WORLD_ID_PRESENT_ACTION = 'present-credential'

export function getAccessSubname(ensName: string): string {
  const normalized = ensName.trim().toLowerCase()
  if (normalized.startsWith('screening.')) {
    return normalized
  }
  if (normalized.includes('.') && !normalized.endsWith('.eth')) {
    return normalized
  }
  const registryParent = process.env.NEXT_PUBLIC_REGISTRY_PARENT?.trim().toLowerCase()
  if (registryParent && normalized.endsWith(`.${registryParent}`)) {
    return normalized
  }
  return `screening.${normalized}`
}

export function getBaseEnsName(ensName: string): string {
  const normalized = ensName.trim().toLowerCase()
  if (normalized.startsWith('screening.')) {
    return normalized.slice('screening.'.length)
  }
  return normalized
}
