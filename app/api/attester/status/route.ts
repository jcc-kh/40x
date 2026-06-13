import { NextRequest, NextResponse } from 'next/server'

import { fetchAttesterInference } from '@/lib/attester'
import { computeAttestationHash } from '@/lib/ens'
import { getInferenceRecord, storeInferenceCompleted } from '@/lib/inference-store'
import { buildAttestationFromCallback, type InferenceCallback } from '@/lib/parse-callback'
import { getAccessSubname } from '@/lib/types'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const inferenceId = request.nextUrl.searchParams.get('id')
    const ensName = request.nextUrl.searchParams.get('ensName') ?? ''
    const thresholdUSD = Number(request.nextUrl.searchParams.get('thresholdUSD') ?? '5000')

    if (!inferenceId) {
      return NextResponse.json({ error: 'id query parameter required' }, { status: 400 })
    }

    const stored = getInferenceRecord(inferenceId)
    if (stored?.status === 'completed' && stored.attestation) {
      const accessSubname = ensName ? getAccessSubname(ensName) : ''
      const timestamp = Date.now()
      const attestationHash = accessSubname
        ? computeAttestationHash(stored.attestation, accessSubname, timestamp)
        : ''

      return NextResponse.json({
        status: 'completed',
        attestation: stored.attestation,
        attestationHash,
        accessSubname,
        timestamp,
      })
    }

    const remote = await fetchAttesterInference(inferenceId)
    if (!remote) {
      return NextResponse.json({
        status: stored?.status ?? 'queued',
        attestation: null,
      })
    }

    const callback = remote as InferenceCallback
    if (callback.status !== 'completed') {
      return NextResponse.json({
        status: callback.status ?? 'queued',
        attestation: null,
      })
    }

    const attestation = buildAttestationFromCallback(callback, thresholdUSD)
    storeInferenceCompleted(inferenceId, attestation)

    const accessSubname = ensName ? getAccessSubname(ensName) : ''
    const timestamp = Date.now()
    const attestationHash = accessSubname
      ? computeAttestationHash(attestation, accessSubname, timestamp)
      : ''

    return NextResponse.json({
      status: 'completed',
      attestation,
      attestationHash,
      accessSubname,
      timestamp,
    })
  } catch (error) {
    console.error('Attester status error:', error)
    const message = error instanceof Error ? error.message : 'Failed to fetch inference status'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
