import { NextRequest, NextResponse } from 'next/server'

import { verifyWorldIdProof } from '@/lib/worldid'

export const runtime = 'nodejs'

/** Presentation-only World ID check — no sybil gate, no nullifier storage. */
export async function POST(request: NextRequest) {
  try {
    const { idkitResponse } = await request.json()

    if (!idkitResponse) {
      return NextResponse.json({ error: 'Missing idkitResponse' }, { status: 400 })
    }

    const nullifier = await verifyWorldIdProof(idkitResponse)
    return NextResponse.json({ success: true, nullifier })
  } catch (error) {
    console.error('World ID presentation verify error:', error)
    const message = error instanceof Error ? error.message : 'World ID verification failed'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
