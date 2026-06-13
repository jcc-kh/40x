import type { DocumentPdfInput } from './types'

const DEFAULT_ATTESTER_URL = 'https://confidential-ai-dev-preview.cldev.cloud'

/** Public URL Attester POSTs to when inference completes. */
export function resolveCallbackUrl(ensName?: string, thresholdUSD = 5000): string {
  const base =
    process.env.CRE_CALLBACK_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}/api/attester/callback` : '')

  if (!base) return ''

  const url = new URL(base)
  if (ensName) url.searchParams.set('ensName', ensName)
  url.searchParams.set('thresholdUSD', String(thresholdUSD))
  return url.toString()
}

export function getAttesterConfig() {
  const baseUrl = process.env.CHAINLINK_ATTESTER_URL ?? DEFAULT_ATTESTER_URL
  const apiKey = process.env.INFERENCE_API_KEY

  if (!apiKey) {
    throw new Error('INFERENCE_API_KEY is required. Obtain it at the Chainlink desk.')
  }

  return { baseUrl, apiKey }
}

function buildScreeningPrompt(thresholdUSD: number): string {
  return `Verify tenant screening from the provided passport, bank statement, and payroll documents.
(1) passport name matches bank holder and payroll employee
(2) bank deposits align with payroll amounts for 2+ months
(3) monthly income meets $${thresholdUSD} USD
(4) same employer 3+ months
Never output legal names, account numbers, or passport numbers.
Return ONLY valid JSON:
{"checks":{"nameMatch":"full|partial|none","depositMonths":3,"payrollEmployerMonths":4,"bankPayrollAmountMatch":true,"monthlyIncomeUSD":6200,"documentQuality":"high"},"flags":""}`
}

export async function submitAttesterInference(
  input: DocumentPdfInput,
  options?: { ensName?: string },
) {
  const { baseUrl, apiKey } = getAttesterConfig()
  const thresholdUSD = input.thresholdUSD > 0 ? input.thresholdUSD : 5000
  const callbackUrl = resolveCallbackUrl(options?.ensName, thresholdUSD)

  if (!callbackUrl) {
    throw new Error(
      'CRE_CALLBACK_URL is required locally, or deploy to Vercel (uses VERCEL_URL automatically)',
    )
  }

  const body = {
    model: 'gemma4',
    system_prompt:
      'You are a tenant screening analyst. Analyze documents inside a TEE. Never output PII. Respond with ONLY valid JSON.',
    prompt: buildScreeningPrompt(thresholdUSD),
    resources: [
      {
        filename: 'passport.pdf',
        content_type: 'application/pdf',
        content_base64: input.passportBase64,
      },
      {
        filename: 'bank.pdf',
        content_type: 'application/pdf',
        content_base64: input.bankBase64,
      },
      {
        filename: 'payroll.pdf',
        content_type: 'application/pdf',
        content_base64: input.payrollBase64,
      },
    ],
    cre_callback: { url: callbackUrl },
  }

  const response = await fetch(`${baseUrl}/v1/inference`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const data = (await response.json()) as { id?: string; status?: string; error?: string }

  if (!response.ok) {
    throw new Error(data.error ?? `Attester API error (${response.status})`)
  }

  if (!data.id) {
    throw new Error('Attester API did not return inference id')
  }

  return {
    inferenceId: data.id,
    status: data.status ?? 'queued',
  }
}

export async function fetchAttesterInference(inferenceId: string) {
  const { baseUrl, apiKey } = getAttesterConfig()

  const response = await fetch(`${baseUrl}/v1/inference/${inferenceId}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  })

  if (response.status === 404) {
    return null
  }

  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.error ?? `Attester status error (${response.status})`)
  }

  return data as Record<string, unknown>
}
