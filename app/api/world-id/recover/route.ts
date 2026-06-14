import { NextRequest, NextResponse } from 'next/server'
import { isAddress } from 'viem'

import { recoverAlreadyVerifiedWorldId } from '@/lib/worldid-recover'
import { issueWorldIdVerificationSeal } from '@/lib/worldid-seal'

export const runtime = 'nodejs'

/** When IDKit returns nullifier_replayed / max_verifications_reached, recover stored nullifier. */
export async function POST(request: NextRequest) {
  try {
    const { address, errorCode, signal, ensName } = await request.json()

    if (!address || !isAddress(address)) {
      return NextResponse.json({ error: 'Valid address required' }, { status: 400 })
    }

    console.info('[World ID] recover request', { address, errorCode: errorCode ?? null })

    const recovered = await recoverAlreadyVerifiedWorldId(address, signal ?? ensName)
    if (!recovered) {
      return NextResponse.json(
        {
          error:
            'Already verified on Worldcoin, but no nullifier found locally. Enable SKIP_WORLD_ID_VERIFY or add a new WORLD_ID_ACTION.',
        },
        { status: 404 },
      )
    }

    console.info('[World ID] recover success', {
      address,
      source: recovered.source,
      alreadyIssuedCredential: recovered.alreadyIssuedCredential,
    })

    return NextResponse.json({
      success: true,
      nullifier: recovered.nullifier,
      recovered: true,
      source: recovered.source,
      alreadyIssuedCredential: recovered.alreadyIssuedCredential,
      demoBypass: recovered.source === 'demo',
      verificationSeal: issueWorldIdVerificationSeal(recovered.nullifier, address),
    })
  } catch (error) {
    console.error('[World ID] recover error:', error)
    return NextResponse.json({ error: 'Failed to recover World ID verification' }, { status: 500 })
  }
}
