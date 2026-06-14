import { Suspense } from 'react'

import { PresentPageClient } from '@/components/PresentPageClient'

export default function PresentPage() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
        <PresentPageClient />
      </Suspense>
    </main>
  )
}
