import { NextRequest, NextResponse } from 'next/server'

import { assertNullifierVerified, markCredentialIssued } from '@/lib/nullifiers'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const { worldIdNullifier } = await request.json()

    if (!worldIdNullifier) {
      return NextResponse.json({ error: 'Missing worldIdNullifier' }, { status: 400 })
    }

    assertNullifierVerified(worldIdNullifier)
    markCredentialIssued(worldIdNullifier)

    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to finalize credential'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
