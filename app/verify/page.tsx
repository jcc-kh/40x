import Link from 'next/link'
import { Suspense } from 'react'

import { VerifyForm } from '@/components/VerifyForm'

export default function VerifyPage() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Verify Credential</h1>
          <p className="text-zinc-600">Enter the screening subname the tenant shared</p>
        </div>
        <Link href="/" className="text-sm underline">
          Tenant flow
        </Link>
      </div>

      <Suspense fallback={<p className="text-zinc-500">Loading verify form…</p>}>
        <VerifyForm />
      </Suspense>
    </main>
  )
}
