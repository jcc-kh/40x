import { NextRequest, NextResponse } from 'next/server'
import { isAddress } from 'viem'

import {
  discoverCredentialForAddress,
  canPublishToEnsName,
  explainEnsPublishBlocker,
  resolvePublishTarget,
} from '@/lib/ens'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address')

  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: 'Valid address query parameter required' }, { status: 400 })
  }

  const publishTarget = await resolvePublishTarget(address)
  const discovered = await discoverCredentialForAddress(address)
  const canPublish = publishTarget ? await canPublishToEnsName(address, publishTarget) : false
  const publishBlocker =
    publishTarget && !canPublish ? await explainEnsPublishBlocker(address, publishTarget) : null

  return NextResponse.json({
    address,
    publishTarget,
    canPublish,
    publishBlocker,
    ensName: discovered?.ensName ?? null,
    credential: discovered?.credential ?? null,
  })
}
