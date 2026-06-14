import { getWorldIdAction } from './types'

export function getWorldIdConfig() {
  return {
    appId: process.env.NEXT_PUBLIC_WORLD_APP_ID ?? '',
    rpId: process.env.WORLD_RP_ID ?? '',
    signingKey: process.env.RP_SIGNING_KEY ?? '',
    action: process.env.WORLD_ID_ACTION ?? getWorldIdAction(),
  }
}

/** When true, POST /api/world-id/verify accepts devBypass. */
export function isWorldIdDevBypassEnabled(): boolean {
  if (process.env.SKIP_WORLD_ID_VERIFY === 'true') return true
  return process.env.NODE_ENV !== 'production'
}

/** Local demo / hackathon — allow synthetic nullifiers outside production. */
export function isWorldIdDemoBypassAllowed(): boolean {
  return process.env.NODE_ENV !== 'production'
}

export function createDemoNullifierForAddress(address: string, signal?: string): string {
  const wallet = address.toLowerCase()
  const suffix = signal?.replace(/[^a-zA-Z0-9.-]/g, '').slice(0, 32) ?? 'local'
  return `demo-nullifier-${wallet}-${suffix}`
}

export function createDevNullifier(signal?: string, address?: string): string {
  if (address) return createDemoNullifierForAddress(address, signal)
  const suffix = signal?.slice(0, 32) ?? 'local'
  return `dev-nullifier-${suffix}-${Date.now()}`
}

export function extractNullifierFromVerifyResponse(data: {
  results?: Array<{ nullifier?: string; success?: boolean; nullifier_hash?: string }>
  nullifier?: string
  nullifier_hash?: string
  code?: string
  detail?: string
}): string | null {
  if (data.nullifier) return data.nullifier
  if (data.nullifier_hash) return data.nullifier_hash
  const fromResults = data.results?.find(
    (result) => result.nullifier || result.nullifier_hash,
  )
  if (fromResults?.nullifier) return fromResults.nullifier
  if (fromResults?.nullifier_hash) return fromResults.nullifier_hash
  const success = data.results?.find((result) => result.success && result.nullifier)
  return success?.nullifier ?? null
}

/** Pull nullifier from an IDKit widget result (searches nested proof payloads). */
export function extractNullifierFromIdkitResponse(idkitResponse: unknown): string | null {
  if (!idkitResponse || typeof idkitResponse !== 'object') return null

  const seen = new Set<object>()

  function walk(value: unknown): string | null {
    if (!value || typeof value !== 'object') return null
    if (seen.has(value as object)) return null
    seen.add(value as object)

    const record = value as Record<string, unknown>

    if (typeof record.nullifier === 'string' && record.nullifier.length > 0) {
      return record.nullifier
    }
    if (typeof record.nullifier_hash === 'string' && record.nullifier_hash.length > 0) {
      return record.nullifier_hash
    }
    if (Array.isArray(record.session_nullifier)) {
      const first = record.session_nullifier.find((entry) => typeof entry === 'string' && entry.length > 0)
      if (typeof first === 'string') return first
    }

    for (const child of Object.values(record)) {
      const found = walk(child)
      if (found) return found
    }

    return null
  }

  return walk(idkitResponse)
}

export function formatWorldIdVerifyError(verifyData: {
  code?: string
  detail?: string
  error?: string
  error_description?: string
  message?: string
}): string {
  const code = verifyData.code
  const detail =
    verifyData.detail ??
    verifyData.error_description ??
    verifyData.error ??
    verifyData.message

  if (code === 'nullifier_replayed') {
    return 'nullifier_replayed — this World ID proof was already submitted. Scan again in World App (fresh proof), do not retry the same scan.'
  }
  if (code === 'already_verified') {
    return `already_verified — you can only complete action "${getWorldIdAction()}" once per person on Worldcoin. For local retests: add a new action in developer.world.org and set WORLD_ID_ACTION, or set SKIP_WORLD_ID_VERIFY=true.`
  }

  return typeof detail === 'string' ? detail : 'World ID verification failed'
}

export function logWorldIdFailure(
  context: string,
  meta: Record<string, unknown>,
  verifyData?: Record<string, unknown>,
) {
  console.error(`[World ID] ${context}`, {
    ...meta,
    worldcoinResponse: verifyData ?? null,
  })
}

export async function verifyWorldIdProof(idkitResponse: unknown): Promise<string> {
  const config = getWorldIdConfig()
  if (!config.rpId) {
    throw new Error('WORLD_RP_ID is not configured')
  }

  const verifyResponse = await fetch(
    `https://developer.worldcoin.org/api/v4/verify/${config.rpId}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(idkitResponse),
    },
  )

  const verifyData = await verifyResponse.json()
  if (!verifyResponse.ok || !verifyData.success) {
    logWorldIdFailure('verifyWorldIdProof failed', {
      rpId: config.rpId,
      action: getWorldIdAction(),
      httpStatus: verifyResponse.status,
    }, verifyData as Record<string, unknown>)
    throw new Error(formatWorldIdVerifyError(verifyData))
  }

  const nullifier = extractNullifierFromVerifyResponse(verifyData)
  if (!nullifier) {
    throw new Error('No nullifier returned from World ID')
  }

  return nullifier
}
