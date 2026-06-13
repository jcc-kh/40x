import { NextRequest, NextResponse } from 'next/server'

import { readCredential } from '@/lib/ens'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const ensName = request.nextUrl.searchParams.get('ensName')

  if (!ensName || !ensName.endsWith('.eth')) {
    return NextResponse.json({ error: 'Valid ensName query parameter required' }, { status: 400 })
  }

  const credential = await readCredential(ensName)

  if (!credential) {
    return NextResponse.json({ error: 'No credential found' }, { status: 404 })
  }

  return NextResponse.json({ ensName, credential })
}
