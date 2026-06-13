import { NextRequest, NextResponse } from 'next/server'

import {
  assertNoExistingCredential,
  storeVerifiedNullifier,
} from '@/lib/nullifiers'
import { extractNullifierFromVerifyResponse, getWorldIdConfig } from '@/lib/worldid'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const { idkitResponse, ensName } = await request.json()
    const config = getWorldIdConfig()

    if (!idkitResponse || !config.rpId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const verifyResponse = await fetch(
      `https://developer.worldcoin.org/api/v4/verify/${config.rpId}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(idkitResponse),
      },
    )

    const verifyData = await verifyResponse.json()

    if (!verifyResponse.ok || !verifyData.success) {
      return NextResponse.json(
        { error: 'World ID verification failed', details: verifyData },
        { status: 400 },
      )
    }

    const nullifier = extractNullifierFromVerifyResponse(verifyData)
    if (!nullifier) {
      return NextResponse.json({ error: 'No nullifier returned from World ID' }, { status: 400 })
    }

    try {
      assertNoExistingCredential(nullifier)
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Duplicate credential' },
        { status: 409 },
      )
    }

    storeVerifiedNullifier(nullifier, ensName)

    return NextResponse.json({ success: true, nullifier })
  } catch (error) {
    console.error('World ID verify error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
