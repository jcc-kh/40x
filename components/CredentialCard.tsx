import type { DocumentAttestation } from '@/lib/types'

interface CredentialCardProps {
  ensName: string
  attestation: DocumentAttestation
  attestationHash: string
  humanVerified?: boolean
  shareUrl?: string
  rotatingPaymentAddr?: string
  issuedAt?: number
  expiresAt?: number
}

export function CredentialCard({
  ensName,
  attestation,
  attestationHash,
  humanVerified,
  shareUrl,
  rotatingPaymentAddr,
  issuedAt,
  expiresAt,
}: CredentialCardProps) {
  return (
    <div className="rounded-lg border p-6">
      <div className="mb-4 flex items-center gap-2">
        <span className="text-2xl">{attestation.verified ? '✅' : '❌'}</span>
        <h2 className="text-xl font-semibold">
          {attestation.verified ? 'Screening Credential' : 'Verification Failed'}
        </h2>
      </div>

      <div className="space-y-2 rounded bg-zinc-50 p-4 text-sm">
        <Row label="Access subname" value={ensName} />
        {humanVerified ? <Row label="Human uniqueness" value="World ID verified" /> : null}
        <Row label="Document ownership" value={attestation.documentOwnershipVerified ? 'Yes' : 'No'} />
        <Row label="Documents consistent" value={attestation.documentsConsistent ? 'Yes' : 'No'} />
        <Row label="Income verified" value={attestation.incomeVerified ? 'Yes' : 'No'} />
        <Row label="Income range" value={attestation.incomeRange} />
        <Row label="Stable employment" value={attestation.employmentStable ? 'Yes' : 'No'} />
        <Row label="Confidence" value={attestation.confidenceScore} />
        {attestation.inferenceId ? <Row label="Inference ID" value={attestation.inferenceId} /> : null}
        {attestation.transcriptHash ? (
          <Row label="Transcript hash" value={truncateHash(attestation.transcriptHash)} />
        ) : null}
        {attestation.documentDigest ? (
          <Row label="Document digest" value={truncateHash(attestation.documentDigest)} />
        ) : null}
        {rotatingPaymentAddr ? <Row label="Payment alias" value={rotatingPaymentAddr} /> : null}
        {attestation.flags ? <Row label="Flags" value={attestation.flags} /> : null}
        {issuedAt ? (
          <Row label="Issued" value={new Date(issuedAt * 1000).toLocaleDateString()} />
        ) : null}
        {expiresAt ? (
          <Row label="Expires" value={new Date(expiresAt * 1000).toLocaleDateString()} />
        ) : null}
      </div>

      {shareUrl ? (
        <p className="mt-4 break-all text-sm text-blue-700">
          Landlord link: <a href={shareUrl} className="underline">{shareUrl}</a>
        </p>
      ) : null}

      <p className="mt-4 break-all font-mono text-xs text-zinc-500">Attestation: {attestationHash}</p>
      <p className="mt-2 text-xs text-zinc-500">
        Screening only. Legal identity is disclosed separately at lease signing.
      </p>
      <p className="mt-1 text-xs text-emerald-600">
        Chainlink Attester TEE · World ID · ENS proof anchors
      </p>
    </div>
  )
}

function truncateHash(value: string) {
  if (value.length <= 18) return value
  return `${value.slice(0, 10)}…${value.slice(-8)}`
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-zinc-100 py-2 last:border-0">
      <span className="text-zinc-600">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  )
}
