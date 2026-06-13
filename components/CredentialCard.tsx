import type { AttestationResult } from '@/lib/types'

interface CredentialCardProps {
  ensName: string
  attestation: AttestationResult
  attestationHash: string
  issuedAt?: number
  expiresAt?: number
}

export function CredentialCard({
  ensName,
  attestation,
  attestationHash,
  issuedAt,
  expiresAt,
}: CredentialCardProps) {
  return (
    <div className="rounded-lg border p-6">
      <div className="mb-4 flex items-center gap-2">
        <span className="text-2xl">{attestation.verified ? '✅' : '❌'}</span>
        <h2 className="text-xl font-semibold">
          {attestation.verified ? 'Credential Generated' : 'Verification Failed'}
        </h2>
      </div>

      <div className="space-y-2 rounded bg-zinc-50 p-4 text-sm">
        <Row label="ENS Name" value={ensName} />
        <Row label="Income Verified" value={attestation.incomeVerified ? 'Yes' : 'No'} />
        <Row label="Identity Consistent" value={attestation.identityVerified ? 'Yes' : 'No'} />
        <Row label="Income Range" value={attestation.incomeRange} />
        <Row label="Stable Employment" value={attestation.employerStable ? 'Yes' : 'No'} />
        <Row label="Confidence" value={attestation.confidenceScore} />
        {attestation.flags ? <Row label="Flags" value={attestation.flags} /> : null}
        {issuedAt ? (
          <Row label="Issued" value={new Date(issuedAt * 1000).toLocaleDateString()} />
        ) : null}
        {expiresAt ? (
          <Row label="Expires" value={new Date(expiresAt * 1000).toLocaleDateString()} />
        ) : null}
      </div>

      <p className="mt-4 break-all font-mono text-xs text-zinc-500">Attestation: {attestationHash}</p>
      <p className="mt-2 text-xs text-emerald-600">
        Stored on {ensName} · Processed by Chainlink TEE · Verified by World ID
      </p>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-zinc-100 py-2 last:border-0">
      <span className="text-zinc-600">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  )
}
