import { NextRequest, NextResponse } from 'next/server'
import { isAddress } from 'viem'

import { submitAttesterInference } from '@/lib/attester'
import { runCRECallbackSimulationFromFixture } from '@/lib/chainlink'
import { computeAttestationHash, resolvePublishTarget } from '@/lib/ens'
import { storeInferenceQueued } from '@/lib/inference-store'
import {
  assertNoExistingCredential,
  resolveVerifiedNullifier,
} from '@/lib/nullifiers'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const {
      documentPdfs,
      thresholdUSD,
      worldIdNullifier,
      tenantAddress,
      useFixture,
      verificationSeal,
    } = await request.json()

    if (!worldIdNullifier || !tenantAddress) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (!isAddress(tenantAddress)) {
      return NextResponse.json({ error: 'Invalid tenantAddress' }, { status: 400 })
    }

    const accessSubname = await resolvePublishTarget(tenantAddress)
    if (!accessSubname) {
      return NextResponse.json(
        {
          error:
            'No ENS publish target for wallet. Set NEXT_PUBLIC_REGISTRY_PARENT or use a wallet with an ENS name.',
        },
        { status: 400 },
      )
    }

    await resolveVerifiedNullifier(worldIdNullifier, {
      verificationSeal,
      tenantAddress,
      ensName: accessSubname,
    })
    assertNoExistingCredential(worldIdNullifier)

    const threshold = thresholdUSD ?? 5000

    const shouldUseFixture =
      useFixture === true ||
      process.env.USE_CRE_FIXTURE === 'true' ||
      !process.env.INFERENCE_API_KEY

    if (shouldUseFixture && process.env.VERCEL) {
      return NextResponse.json(
        {
          error:
            'USE_CRE_FIXTURE is not supported on Vercel. Set INFERENCE_API_KEY and deploy with live Attester.',
        },
        { status: 400 },
      )
    }

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

    const submission = await submitAttesterInference(
      {
        passportBase64: documentPdfs.passport,
        bankBase64: documentPdfs.bank,
        payrollBase64: documentPdfs.payroll,
        thresholdUSD: threshold,
        worldIdNullifier,
        tenantAddress,
      },
      { ensName: accessSubname },
    )

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
