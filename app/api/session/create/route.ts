import { NextRequest, NextResponse } from 'next/server'
import { generateSiweNonce } from 'viem/siwe'

import { createVerificationSession } from '@/lib/sessions'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const nonce = generateSiweNonce()
    const session = createVerificationSession(nonce)
    const origin = request.nextUrl.origin
    const presentUrl = `${origin}/present?session=${session.sessionId}`

    return NextResponse.json({
      sessionId: session.sessionId,
      nonce: session.nonce,
      expiresAt: session.expiresAt,
      presentUrl,
    })
  } catch (error) {
    console.error('Session create error:', error)
    return NextResponse.json({ error: 'Failed to create verification session' }, { status: 500 })
  }
}
