import { WORLD_ID_ACTION } from './types'

export function getWorldIdConfig() {
  return {
    appId: process.env.NEXT_PUBLIC_WORLD_APP_ID ?? '',
    rpId: process.env.WORLD_RP_ID ?? '',
    signingKey: process.env.RP_SIGNING_KEY ?? '',
    action: WORLD_ID_ACTION,
  }
}

export function extractNullifierFromVerifyResponse(data: {
  results?: Array<{ nullifier?: string; success?: boolean }>
  nullifier?: string
}): string | null {
  if (data.nullifier) return data.nullifier
  const success = data.results?.find((result) => result.success && result.nullifier)
  return success?.nullifier ?? null
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
    throw new Error('World ID verification failed')
  }

  const nullifier = extractNullifierFromVerifyResponse(verifyData)
  if (!nullifier) {
    throw new Error('No nullifier returned from World ID')
  }

  return nullifier
}
