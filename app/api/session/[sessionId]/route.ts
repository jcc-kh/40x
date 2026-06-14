import { NextRequest, NextResponse } from 'next/server'

import { getVerificationSession } from '@/lib/sessions'

export const runtime = 'nodejs'

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await context.params
  const session = getVerificationSession(sessionId)

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  return NextResponse.json({
    sessionId: session.sessionId,
    nonce: session.nonce,
    status: session.status,
    expiresAt: session.expiresAt,
    verifiedAt: session.verifiedAt,
    tenantAddress: session.tenantAddress,
    ensName: session.credentialEnsName,
    credential: session.credential,
  })
}
