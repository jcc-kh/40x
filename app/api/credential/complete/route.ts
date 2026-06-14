import { NextRequest, NextResponse } from 'next/server'

import { markCredentialIssued, resolveVerifiedNullifier } from '@/lib/nullifiers'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const { worldIdNullifier, verificationSeal, tenantAddress } = await request.json()

    if (!worldIdNullifier) {
      return NextResponse.json({ error: 'Missing worldIdNullifier' }, { status: 400 })
    }

    await resolveVerifiedNullifier(worldIdNullifier, {
      verificationSeal,
      tenantAddress,
    })
    markCredentialIssued(worldIdNullifier)

    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to finalize credential'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
