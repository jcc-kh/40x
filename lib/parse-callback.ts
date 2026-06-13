import type { DocumentAttestation } from './types'

interface InferenceResource {
  digest?: string
  request_digest?: string
  response_digest?: string
}

export interface InferenceCallback {
  id?: string
  status?: string
  output?: string
  documentDigest?: string
  resource_summaries?: { digest?: string; filename?: string }[]
  resources?: InferenceResource[]
}

interface VerificationChecks {
  nameMatch: string
  depositMonths: number
  payrollEmployerMonths: number
  bankPayrollAmountMatch: boolean
  monthlyIncomeUSD: number
  documentQuality: string
}

interface ChecksResponse {
  checks: VerificationChecks
  flags: string
}

function cleanJSON(text: string): string {
  const trimmed = text.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
  if (fenced?.[1]) return fenced[1].trim()
  const inline = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (inline?.[1]) return inline[1].trim()
  return trimmed
}

function toBytes32Hex(hex: string): string {
  const h = hex.replace(/^0x/i, '')
  if (h.length !== 64) {
    throw new Error(`expected 32-byte hex digest, got "${hex}"`)
  }
  return `0x${h.toLowerCase()}`
}

function scoreNameMatch(value: string): number {
  switch (value.toLowerCase().trim()) {
    case 'full':
      return 1
    case 'partial':
      return 0.5
    default:
      return 0
  }
}

function scoreMonths(months: number): number {
  if (months <= 0) return 0
  return Math.min(months / 3, 1)
}

function scoreIncome(monthlyIncomeUSD: number, thresholdUSD: number): number {
  if (monthlyIncomeUSD <= 0 || thresholdUSD <= 0) return 0
  return Math.min(monthlyIncomeUSD / thresholdUSD, 1)
}

function scoreDocumentQuality(value: string): number {
  switch (value.toLowerCase().trim()) {
    case 'high':
      return 1
    case 'medium':
      return 0.6
    case 'low':
      return 0.2
    default:
      return 0.2
  }
}

function computeConfidenceScore(checks: VerificationChecks, thresholdUSD: number): number {
  const score =
    0.25 * scoreNameMatch(checks.nameMatch) +
    0.25 * scoreIncome(checks.monthlyIncomeUSD, thresholdUSD) +
    0.2 * scoreMonths(checks.depositMonths) +
    0.15 * scoreMonths(checks.payrollEmployerMonths) +
    0.1 * (checks.bankPayrollAmountMatch ? 1 : 0) +
    0.05 * scoreDocumentQuality(checks.documentQuality)
  return Math.round(score * 100) / 100
}

function bucketIncomeRange(monthlyIncomeUSD: number, thresholdUSD: number): string {
  if (monthlyIncomeUSD <= 0) return 'unknown'
  if (monthlyIncomeUSD < thresholdUSD) return 'below-threshold'
  if (monthlyIncomeUSD < 7000) return '5k-7k'
  if (monthlyIncomeUSD < 10000) return '7k-10k'
  if (monthlyIncomeUSD < 15000) return '10k-15k'
  return '15k+'
}

export function buildAttestationFromCallback(
  callback: InferenceCallback,
  thresholdUSD: number,
): DocumentAttestation {
  if (callback.status !== 'completed') {
    throw new Error(`Inference status is ${callback.status ?? 'unknown'}, expected completed`)
  }

  const responseDigest = callback.resources?.[0]?.response_digest
  if (!responseDigest) {
    throw new Error('Missing resources[0].response_digest in Attester callback')
  }

  const transcriptHash = toBytes32Hex(responseDigest)
  const documentDigest =
    callback.documentDigest ??
    callback.resources?.[0]?.digest ??
    callback.resource_summaries?.[0]?.digest ??
    ''

  const raw = cleanJSON(callback.output ?? '')
  const checksResp = JSON.parse(raw) as ChecksResponse
  const checks = checksResp.checks
  const flags = checksResp.flags ?? ''

  const confidence = computeConfidenceScore(checks, thresholdUSD)
  const documentOwnershipVerified = checks.nameMatch.toLowerCase().trim() === 'full'
  const documentsConsistent = checks.bankPayrollAmountMatch && checks.depositMonths >= 2
  const incomeVerified = checks.monthlyIncomeUSD >= thresholdUSD && checks.monthlyIncomeUSD > 0
  const employmentStable = checks.payrollEmployerMonths >= 3
  const verified =
    documentOwnershipVerified && documentsConsistent && incomeVerified && confidence >= 0.7

  return {
    verified,
    documentOwnershipVerified,
    documentsConsistent,
    incomeVerified,
    incomeRange: bucketIncomeRange(checks.monthlyIncomeUSD, thresholdUSD),
    employmentStable,
    confidenceScore: confidence.toFixed(2),
    flags: flags.trim(),
    inferenceId: callback.id ?? '',
    transcriptHash,
    documentDigest,
  }
}
