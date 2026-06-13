import { NextRequest, NextResponse } from 'next/server'

import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

import { readCredential } from '@/lib/ens'
import { getAccessSubname } from '@/lib/types'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const { ensName } = await request.json()

    if (!ensName || !ensName.endsWith('.eth')) {
      return NextResponse.json({ error: 'Valid ensName required' }, { status: 400 })
    }

    const accessSubname = getAccessSubname(ensName)
    const credential = await readCredential(accessSubname)

    if (!credential) {
      return NextResponse.json(
        { error: `No credential found on ${accessSubname}` },
        { status: 404 },
      )
    }

    const rotatingPaymentAddr = privateKeyToAccount(generatePrivateKey()).address
    const shareUrl = `${request.nextUrl.origin}/verify?ensName=${encodeURIComponent(accessSubname)}`

    return NextResponse.json({
      accessSubname,
      shareUrl,
      rotatingPaymentAddr,
      message:
        'Sign one ENS transaction to publish the rotating payment alias for this landlord share session.',
    })
  } catch (error) {
    console.error('Credential share error:', error)
    const message = error instanceof Error ? error.message : 'Failed to prepare share link'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
