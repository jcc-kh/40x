import { NextRequest, NextResponse } from 'next/server'

import { submitAttesterInference } from '@/lib/attester'
import { runCRECallbackSimulationFromFixture } from '@/lib/chainlink'
import { computeAttestationHash } from '@/lib/ens'
import { storeInferenceQueued } from '@/lib/inference-store'
import {
  assertNoExistingCredential,
  assertNullifierVerified,
} from '@/lib/nullifiers'
import { getAccessSubname } from '@/lib/types'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const {
      documentPdfs,
      thresholdUSD,
      worldIdNullifier,
      ensName,
      tenantAddress,
      useFixture,
    } = await request.json()

    if (!worldIdNullifier || !ensName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (!ensName.endsWith('.eth')) {
      return NextResponse.json({ error: 'Invalid ENS name' }, { status: 400 })
    }

    assertNullifierVerified(worldIdNullifier)
    assertNoExistingCredential(worldIdNullifier)

    const accessSubname = getAccessSubname(ensName)
    const threshold = thresholdUSD ?? 5000

    const shouldUseFixture =
      useFixture === true ||
      process.env.USE_CRE_FIXTURE === 'true' ||
      !process.env.INFERENCE_API_KEY ||
      !process.env.CRE_CALLBACK_URL

    if (shouldUseFixture) {
      const attestation = await runCRECallbackSimulationFromFixture()
      const timestamp = Date.now()
      const attestationHash = computeAttestationHash(attestation, accessSubname, timestamp)

      return NextResponse.json({
        success: true,
        mode: 'fixture',
        inferenceId: attestation.inferenceId,
        status: 'completed',
        attestation,
        attestationHash,
        accessSubname,
        timestamp,
      })
    }

    if (!documentPdfs?.passport || !documentPdfs?.bank || !documentPdfs?.payroll) {
      return NextResponse.json(
        { error: 'Passport, bank, and payroll PDFs are required' },
        { status: 400 },
      )
    }

    const submission = await submitAttesterInference({
      passportBase64: documentPdfs.passport,
      bankBase64: documentPdfs.bank,
      payrollBase64: documentPdfs.payroll,
      thresholdUSD: threshold,
      worldIdNullifier,
      tenantAddress,
    })

    storeInferenceQueued(submission.inferenceId)

    return NextResponse.json({
      success: true,
      mode: 'attester',
      inferenceId: submission.inferenceId,
      status: submission.status,
      accessSubname,
    })
  } catch (error) {
    console.error('Attester submit error:', error)
    const message = error instanceof Error ? error.message : 'Failed to submit inference'
    const status = message.includes('already has a credential') ? 409 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
