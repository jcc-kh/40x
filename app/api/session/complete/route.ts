import { NextRequest, NextResponse } from 'next/server'
import { isAddress } from 'viem'

import {
  discoverCredentialForAddress,
  isAddressCredentialController,
} from '@/lib/ens'
import { getVerificationSession, markSessionVerified } from '@/lib/sessions'
import { verifyPresentationSiwe } from '@/lib/siwe'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const { sessionId, message, signature, address } = await request.json()

    if (!sessionId || !message || !signature || !address) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (!isAddress(address)) {
      return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
    }

    const session = getVerificationSession(sessionId)
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    if (session.status === 'expired') {
      return NextResponse.json({ error: 'Session expired' }, { status: 410 })
    }

    if (session.status === 'verified') {
      return NextResponse.json({
        success: true,
        status: session.status,
        ensName: session.credentialEnsName,
        credential: session.credential,
      })
    }

    const domain = request.nextUrl.hostname
    const siweValid = await verifyPresentationSiwe({
      message,
      signature,
      address,
      domain,
      nonce: session.nonce,
    })

    if (!siweValid) {
      return NextResponse.json({ error: 'Invalid SIWE signature' }, { status: 401 })
    }

    const discovered = await discoverCredentialForAddress(address)
    if (!discovered) {
      return NextResponse.json(
        {
          error: 'No screening credential found for this wallet on ENS',
          hint: 'Ensure ENS records were published from the same wallet. If using REGISTRY_PARENT=jessie.eth, credential may be on screening.jessie.eth — republish from / if needed.',
        },
        { status: 404 },
      )
    }

    const controller = await isAddressCredentialController(address, discovered.ensName)
    if (!controller) {
      return NextResponse.json(
        { error: 'Wallet does not control this screening credential' },
        { status: 403 },
      )
    }

    const expiresAt = Number.parseInt(discovered.credential.expiresAt, 10)
    if (Number.isFinite(expiresAt) && expiresAt < Math.floor(Date.now() / 1000)) {
      return NextResponse.json({ error: 'Credential expired' }, { status: 410 })
    }

    markSessionVerified(sessionId, address, discovered.ensName, discovered.credential)

    return NextResponse.json({
      success: true,
      status: 'verified',
      ensName: discovered.ensName,
      credential: discovered.credential,
    })
  } catch (error) {
    console.error('Session complete error:', error)
    const message = error instanceof Error ? error.message : 'Failed to complete session'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
