import { NextRequest, NextResponse } from 'next/server'

import { getVerificationSession } from '@/lib/sessions'

export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await context.params
  const seal = request.nextUrl.searchParams.get('seal') ?? undefined
  const session = getVerificationSession(sessionId, seal)

  if (!session) {
    return NextResponse.json(
      {
        error: 'Session not found',
        hint: seal
          ? 'Session seal invalid or expired — ask the landlord for a new invitation link.'
          : 'Missing session seal — open the full invitation link from the landlord.',
      },
      { status: 404 },
    )
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
