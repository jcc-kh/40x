import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const target = new URL('/api/attester/submit', request.nextUrl.origin)

  const response = await fetch(target, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

  const data = await response.json()
  return NextResponse.json(
    {
      ...data,
      deprecated: true,
      message: 'Use /api/attester/submit instead of /api/chainlink',
    },
    { status: response.status },
  )
}
