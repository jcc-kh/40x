export interface DocumentInput {
  passportText: string
  bankText: string
  payrollText: string
  thresholdUSD: number
  worldIdNullifier: string
}

export interface AttestationResult {
  verified: boolean
  incomeVerified: boolean
  identityVerified: boolean
  incomeRange: string
  employerStable: boolean
  confidenceScore: string
  flags: string
  worldIdNullifier: string
}

export const CREDENTIAL_TEXT_KEYS = [
  'zkcred.v1.verified',
  'zkcred.v1.incomeVerified',
  'zkcred.v1.identityVerified',
  'zkcred.v1.incomeRange',
  'zkcred.v1.employerStable',
  'zkcred.v1.confidenceScore',
  'zkcred.v1.attestationHash',
  'zkcred.v1.worldId',
  'zkcred.v1.issuedAt',
  'zkcred.v1.expiresAt',
  'zkcred.v1.issuer',
  'zkcred.v1.version',
] as const

export interface CredentialRecord {
  verified: string
  incomeVerified: string
  identityVerified: string
  incomeRange: string
  employerStable: string
  confidenceScore: string
  attestationHash: string
  worldIdNullifier: string
  issuedAt: string
  expiresAt: string
  issuer: string
  version: string
}

export const WORLD_ID_ACTION = 'verify-credential'
