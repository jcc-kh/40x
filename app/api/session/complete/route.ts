import { NextRequest, NextResponse } from 'next/server'
import { isAddress } from 'viem'

import {
  discoverCredentialForAddress,
  isAddressCredentialController,
} from '@/lib/ens'
import { getVerificationSession, markSessionVerified } from '@/lib/sessions'
import { verifyPresentationSiwe } from '@/lib/siwe'
import { verifyWorldIdProof } from '@/lib/worldid'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const { sessionId, message, signature, address, idkitResponse } = await request.json()

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
        { error: 'No screening credential found for this wallet on ENS' },
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

    if (!idkitResponse) {
      return NextResponse.json({ error: 'World ID presentation proof required' }, { status: 400 })
    }

    const nullifier = await verifyWorldIdProof(idkitResponse)
    if (nullifier !== discovered.credential.worldIdNullifier) {
      return NextResponse.json(
        { error: 'World ID nullifier does not match credential holder' },
        { status: 403 },
      )
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
