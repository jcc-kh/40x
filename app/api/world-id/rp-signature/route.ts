import { NextRequest, NextResponse } from 'next/server'
import { signRequest } from '@worldcoin/idkit/signing'

import { getWorldIdConfig } from '@/lib/worldid'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json()
    const config = getWorldIdConfig()

    if (!config.signingKey) {
      return NextResponse.json({ error: 'RP_SIGNING_KEY is not configured' }, { status: 500 })
    }

    const { sig, nonce, createdAt, expiresAt } = signRequest({
      signingKeyHex: config.signingKey,
      action: action ?? config.action,
    })

    console.info('[World ID] rp-signature issued', {
      action: action ?? config.action,
      rpId: config.rpId,
      nonce,
      expiresAt,
    })

    return NextResponse.json({
      sig,
      nonce,
      created_at: createdAt,
      expires_at: expiresAt,
      rp_id: config.rpId,
    })
  } catch (error) {
    console.error('RP signature error:', error)
    return NextResponse.json({ error: 'Failed to generate RP signature' }, { status: 500 })
  }
}
