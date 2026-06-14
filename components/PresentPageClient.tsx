'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

import { TenantSessionFlow } from '@/components/TenantSessionFlow'

export function PresentPageClient() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session')
  const sessionSeal = searchParams.get('seal')

  return (
    <>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900">Tenant Screening</h1>
          <p className="text-zinc-600">Complete your application for this landlord</p>
        </div>
        <Link href="/verify" className="text-sm text-blue-700 underline">
          Landlord portal
        </Link>
      </div>

      <TenantSessionFlow sessionId={sessionId} sessionSeal={sessionSeal} />
    </>
  )
}
