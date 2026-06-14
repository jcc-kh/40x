import Link from 'next/link'
import { Suspense } from 'react'

import { PresentCredential } from '@/components/PresentCredential'

export default function PresentPage() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Present Credential</h1>
          <p className="text-zinc-600">Live proof for a landlord verification session</p>
        </div>
        <Link href="/" className="text-sm underline">
          Tenant flow
        </Link>
      </div>

      <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
        <PresentCredential />
      </Suspense>
    </main>
  )
}
