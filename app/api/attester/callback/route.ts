import { NextRequest, NextResponse } from 'next/server'

import { computeAttestationHash } from '@/lib/ens'
import { storeInferenceCompleted } from '@/lib/inference-store'
import { buildAttestationFromCallback, type InferenceCallback } from '@/lib/parse-callback'
import { getAccessSubname } from '@/lib/types'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const callback = (await request.json()) as InferenceCallback
    const ensName = request.nextUrl.searchParams.get('ensName') ?? ''
    const thresholdUSD = Number(request.nextUrl.searchParams.get('thresholdUSD') ?? '5000')

    if (!callback.id) {
      return NextResponse.json({ error: 'Missing inference id in callback' }, { status: 400 })
    }

    if (callback.status !== 'completed') {
      return NextResponse.json({
        status: callback.status ?? 'unknown',
        inferenceId: callback.id,
      })
    }

    const attestation = buildAttestationFromCallback(callback, thresholdUSD)
    storeInferenceCompleted(callback.id, attestation)

    if (process.env.CRE_TRIGGER_FORWARD_URL) {
      await fetch(process.env.CRE_TRIGGER_FORWARD_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(callback),
      })
    }

    const accessSubname = ensName ? getAccessSubname(ensName) : ''
    const timestamp = Date.now()
    const attestationHash = accessSubname
      ? computeAttestationHash(attestation, accessSubname, timestamp)
      : ''

    return NextResponse.json({
      status: 'completed',
      inferenceId: callback.id,
      attestation,
      attestationHash,
      accessSubname,
      timestamp,
    })
  } catch (error) {
    console.error('Attester callback error:', error)
    const message = error instanceof Error ? error.message : 'Failed to process callback'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
