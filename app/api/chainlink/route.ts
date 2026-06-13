import { NextRequest, NextResponse } from 'next/server'

import { runCRESimulation } from '@/lib/chainlink'
import { computeAttestationHash } from '@/lib/ens'
import {
  assertNoExistingCredential,
  assertNullifierVerified,
} from '@/lib/nullifiers'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const { documentTexts, thresholdUSD, worldIdNullifier, ensName } = await request.json()

    if (!documentTexts || !worldIdNullifier || !ensName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (!ensName.endsWith('.eth')) {
      return NextResponse.json({ error: 'Invalid ENS name' }, { status: 400 })
    }

    const totalText = Object.values(documentTexts as Record<string, string>).join(' ')
    if (totalText.length > 6000) {
      return NextResponse.json(
        {
          error:
            'Document text too long. Please upload shorter documents or extract key sections.',
        },
        { status: 400 },
      )
    }

    assertNullifierVerified(worldIdNullifier)
    assertNoExistingCredential(worldIdNullifier)

    const attestation = await runCRESimulation({
      passportText: documentTexts.passport ?? '',
      bankText: documentTexts.bank ?? '',
      payrollText: documentTexts.payroll ?? '',
      thresholdUSD: thresholdUSD ?? 5000,
      worldIdNullifier,
    })

    const timestamp = Date.now()
    const attestationHash = computeAttestationHash(attestation, ensName, timestamp)

    return NextResponse.json({
      success: true,
      attestation,
      attestationHash,
      timestamp,
    })
  } catch (error) {
    console.error('Chainlink route error:', error)
    const message = error instanceof Error ? error.message : 'Failed to process documents'
    const status = message.includes('already have a credential') ? 409 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
