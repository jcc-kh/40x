import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="mb-2 text-3xl font-bold text-zinc-900">40x</h1>
      <p className="mb-8 text-zinc-600">Privacy-preserving tenant screening on ENS</p>

      <div className="space-y-6">
        <section className="rounded-lg border border-zinc-200 p-6">
          <h2 className="mb-2 text-xl font-semibold text-zinc-900">Landlords</h2>
          <p className="mb-4 text-sm text-zinc-600">
            Start a screening session and share the invitation link with your applicant. You&apos;ll
            see results after they verify identity, upload documents, and sign.
          </p>
          <Link
            href="/verify"
            className="inline-block rounded bg-black px-6 py-2 text-white"
          >
            Start screening session
          </Link>
        </section>

        <section className="rounded-lg border border-zinc-200 p-6">
          <h2 className="mb-2 text-xl font-semibold text-zinc-900">Tenants</h2>
          <p className="text-sm text-zinc-600">
            Use the invitation link from your landlord (looks like{' '}
            <code className="rounded bg-zinc-100 px-1 text-zinc-800">/present?session=…</code>
            ). You&apos;ll connect your wallet, verify with World ID, upload screening PDFs, and
            sign to submit.
          </p>
        </section>
      </div>
    </main>
  )
}
